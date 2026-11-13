// Planets (live report #37: "planets don't look very good… repeating texture… atmosphere not realistic… some with
// civilization visible"). Every planet gets its own picture made from 3D noise sampled on the sphere, so nothing
// repeats and the features squash naturally toward the edge of the disc:
//   surface   continents + seas, mountains, craters (rocky/barren), ice cracks + caps, lava cracks that glow,
//             dunes + canyons, gas-giant bands + storms, crystal facets, toxic sludge seas
//   clouds    a soft layer that drifts slowly round (worlds with air)
//   shade     the sun is at the system centre: day side, a soft terminator, a dark night side
//   lights    emissive things added AFTER the shade: city lights on the night side (inhabited worlds), lava, crystal
//   air       a thin scattering rim, brighter on the sun side, coloured per kind (none on barren moons)
//   rings     some gas giants; the back half is drawn behind the planet and the front half over it
// Low orbit: when the camera is close, the disc is covered with detail tiles made from the SAME sphere noise with
// more octaves, and inhabited worlds show streets, blocks, buildings and lit roads in their city districts.
// Work is spread over frames with a small time budget (base pictures first, then tiles nearest the middle of the
// screen); memory stays bounded (tiles are an LRU cache, far planets drop their tiles).

import { PLANET_KINDS } from '../sim/galaxy.js';
import { rng, hash } from '../core/math.js';
import { glowSprite } from './fx.js';

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const hx = h => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 3D gradient noise (seeded)
const GX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GZ = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);
function perlin3(seed) {
  const r = rng(seed); const p = new Int32Array(512); const a = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return (x, y, z) => {
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
    const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10), w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    let h, x1 = x - 1, y1 = y - 1, z1 = z - 1;
    h = p[AA] & 15; const g000 = GX[h] * x + GY[h] * y + GZ[h] * z;
    h = p[BA] & 15; const g100 = GX[h] * x1 + GY[h] * y + GZ[h] * z;
    h = p[AB] & 15; const g010 = GX[h] * x + GY[h] * y1 + GZ[h] * z;
    h = p[BB] & 15; const g110 = GX[h] * x1 + GY[h] * y1 + GZ[h] * z;
    h = p[AA + 1] & 15; const g001 = GX[h] * x + GY[h] * y + GZ[h] * z1;
    h = p[BA + 1] & 15; const g101 = GX[h] * x1 + GY[h] * y + GZ[h] * z1;
    h = p[AB + 1] & 15; const g011 = GX[h] * x + GY[h] * y1 + GZ[h] * z1;
    h = p[BB + 1] & 15; const g111 = GX[h] * x1 + GY[h] * y1 + GZ[h] * z1;
    const l1 = g000 + u * (g100 - g000), l2 = g010 + u * (g110 - g010), l3 = g001 + u * (g101 - g001), l4 = g011 + u * (g111 - g011);
    const m1 = l1 + v * (l2 - l1), m2 = l3 + v * (l4 - l3);
    return m1 + w * (m2 - m1);
  };
}
function fbm(N, x, y, z, oct) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * N(x, y, z); n += a; a *= 0.5; x = x * 2.03 + 1.7; y = y * 2.03 - 0.9; z = z * 2.03 + 3.1; }
  return s / n;
}
function ridged(N, x, y, z, oct) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(N(x, y, z)); s += a * v * v; n += a; a *= 0.5; x *= 2.07; y *= 2.07; z *= 2.07; }
  return s / n;
}
function h3(x, y, z, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function h2(x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** One crater layer: returns a brightness change (bowl dark, far wall lit, raised bright rim). */
function crater(X, Y, Z, cs, dens, seed, Lx, Ly) {
  const ix = Math.floor(X / cs), iy = Math.floor(Y / cs), iz = Math.floor(Z / cs);
  if (h3(ix, iy, iz, seed) > dens) return 0;
  const cx = (ix + 0.3 + 0.4 * h3(ix, iy, iz, seed + 1)) * cs, cy = (iy + 0.3 + 0.4 * h3(ix, iy, iz, seed + 2)) * cs, cz = (iz + 0.3 + 0.4 * h3(ix, iy, iz, seed + 3)) * cs;
  const rad = (0.1 + 0.18 * h3(ix, iy, iz, seed + 4)) * cs;
  const ox = X - cx, oy = Y - cy, oz = Z - cz; const d = Math.sqrt(ox * ox + oy * oy + oz * oz) / rad;
  if (d > 1.18) return 0;
  if (d < 1) return -0.28 * (1 - d * d) + ((ox * Lx + oy * Ly) / rad) * 0.32;
  return 0.22 * (1 - Math.abs(d - 1.04) / 0.14);
}
/** Facets (cell noise F1/F2) for crystal worlds: [cell value, edge closeness]. */
function facets(X, Y, Z, seed, out) {
  const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z); let f1 = 9, f2 = 9, id = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const px = cx + h3(cx, cy, cz, seed), py = cy + h3(cx, cy, cz, seed + 7), pz = cz + h3(cx, cy, cz, seed + 13);
    const d = (px - X) ** 2 + (py - Y) ** 2 + (pz - Z) ** 2;
    if (d < f1) { f2 = f1; f1 = d; id = h3(cx, cy, cz, seed + 21); } else if (d < f2) f2 = d;
  }
  out[0] = id; out[1] = Math.sqrt(f2) - Math.sqrt(f1);
}

// air colour + thickness, cloud cover + colour, per kind
const LOOK = {
  rocky:   { air: '#9fc0ff', airK: 0.55, clouds: 0.18, cloud: '#f2f4f8', scale: 1.6 },
  ice:     { air: '#c8ecff', airK: 0.6, clouds: 0.25, cloud: '#ffffff', scale: 1.8 },
  lava:    { air: '#ff8a4a', airK: 0.75, clouds: 0.22, cloud: '#4a3a34', scale: 1.7 },
  jungle:  { air: '#7cc4ff', airK: 1.0, clouds: 0.55, cloud: '#ffffff', scale: 1.5 },
  desert:  { air: '#ffd0a0', airK: 0.6, clouds: 0.07, cloud: '#fff4e4', scale: 1.6 },
  ocean:   { air: '#6cb2ff', airK: 1.05, clouds: 0.6, cloud: '#ffffff', scale: 1.4 },
  gas:     { air: null, airK: 0.85, clouds: 0, cloud: '#ffffff', scale: 1 },
  crystal: { air: '#ffa8f4', airK: 0.7, clouds: 0.08, cloud: '#ffe8ff', scale: 1.9 },
  toxic:   { air: '#d8f07a', airK: 1.35, clouds: 0.6, cloud: '#e4f0a0', scale: 1.5 },
  barren:  { air: null, airK: 0, clouds: 0, cloud: '#ffffff', scale: 1.8 },
};

function makeCfg(p, sun) {
  const pk = PLANET_KINDS[p.kind] || PLANET_KINDS.rocky; const look = LOOK[p.kind] || LOOK.rocky;
  const r = rng(hash(p.seed, 'look'));
  const lx = (sun?.x || 0) - p.x, ly = (sun?.y || 0) - p.y; const ll = Math.hypot(lx, ly) || 1;
  // light from the sun, tipped a little toward the viewer so a near-side planet is not exactly half lit
  const Lx = lx / ll * 0.9, Ly = ly / ll * 0.9, Lz = 0.42; const Ln = Math.hypot(Lx, Ly, Lz);
  const cfg = {
    p, kind: p.kind, pk, look, gas: !!pk.gas,
    base: hx(pk.base), dark: hx(pk.dark), light: hx(pk.light), glow: pk.glow ? hx(pk.glow) : null,
    N: perlin3(p.seed), N2: perlin3(p.seed + 101), N3: perlin3(p.seed + 202),
    off: [r() * 100, r() * 100, r() * 100], scale: look.scale * (0.85 + r() * 0.3),
    L: [Lx / Ln, Ly / Ln, Lz / Ln], L2: [lx / ll, ly / ll],
    sea: { ocean: 0.6, jungle: 0.47, toxic: 0.44, rocky: 0.36, ice: 0.3, desert: 0.3 }[p.kind] ?? -1,
    inhabited: !!p.inhabited, s: p.seed >>> 0,
    bands: 9 + r() * 10, ring: pk.gas && r() < 0.55, ringAng: r() * Math.PI, ringTilt: 0.28 + r() * 0.18,
    storms: [], airCol: hx(look.air || pk.light),
  };
  if (cfg.gas) for (let i = 0; i < 2 + Math.floor(r() * 3); i++) { const lat = (r() - 0.5) * 1.3, lon = r() * Math.PI * 2; cfg.storms.push({ x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon), rad: 0.08 + r() * 0.12, col: r() < 0.5 ? hx(pk.light) : [200, 110, 80] }); }
  return cfg;
}

const mixc = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
const SEA_DEEP = { ocean: [8, 30, 78], jungle: [10, 40, 80], toxic: [40, 46, 12], rocky: [26, 40, 60], ice: [30, 60, 96], desert: [60, 44, 26] };
const SEA_SHALLOW = { ocean: [30, 110, 150], jungle: [30, 100, 120], toxic: [90, 104, 30], rocky: [50, 80, 100], ice: [80, 130, 170], desert: [140, 110, 70] };
const FAC = new Float32Array(2);

/**
 * Sample the surface at unit-sphere point (nx, ny, nz); (wx, wy) is the planet-local world position (for streets).
 * Writes albedo into o[0..2] (0-255), emissive into o[3..5], and returns nothing. oct = noise octaves; street = how
 * fine the street detail can be drawn (world units per texel; Infinity = none).
 */
function sample(cfg, nx, ny, nz, wx, wy, oct, tex, o) {
  const N = cfg.N, N2 = cfg.N2, N3 = cfg.N3, sc = cfg.scale;
  let X = nx * sc + cfg.off[0], Y = ny * sc + cfg.off[1], Z = nz * sc + cfg.off[2];
  o[3] = o[4] = o[5] = 0;
  const col = o; // write albedo directly
  if (cfg.gas) {
    // bands by latitude, bent by turbulence; storms are big swirling ovals
    const turb = fbm(N2, nx * 2.2, ny * 9, nz * 2.2, Math.min(oct - 2, 8));
    const b = Math.sin(ny * cfg.bands + turb * 3.2 + fbm(N, nx * 1.2, ny * 3, nz * 1.2, 3) * 2) * 0.5 + 0.5;
    const fine = fbm(N3, nx * 6, ny * 30, nz * 6, Math.min(oct, 5)) * 0.5 + 0.5;
    if (b < 0.5) mixc(col, cfg.dark, cfg.base, b * 2); else mixc(col, cfg.base, cfg.light, (b - 0.5) * 2);
    const k = 0.82 + fine * 0.36; col[0] *= k; col[1] *= k; col[2] *= k;
    for (const s of cfg.storms) {
      const dx = nx - s.x, dy = (ny - s.y) * 1.8, dz = nz - s.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / s.rad;
      if (d < 1.4) { const sw = Math.sin(d * 9 - Math.atan2(dy, dx + dz) * 2) * 0.5 + 0.5; const t = (1 - smooth(0.6, 1.4, d)) * (0.55 + sw * 0.35); mixc(col, col, s.col, t); }
    }
    return;
  }
  // domain warp: bends continents into natural shapes
  const wq = 0.55, ax = fbm(N2, X * 0.8, Y * 0.8, Z * 0.8, 2), ay = fbm(N2, X * 0.8 + 5.2, Y * 0.8 + 1.3, Z * 0.8 + 7.7, 2);
  X += ax * wq; Y += ay * wq; Z += (ax - ay) * wq * 0.5;
  const e = fbm(N, X, Y, Z, oct); const h = clamp01(e * 1.25 + 0.5);
  const lat = Math.abs(ny);
  const Lx = cfg.L2[0], Ly = cfg.L2[1];
  let land = 1;
  switch (cfg.kind) {
    case 'rocky': {
      if (h < 0.5) mixc(col, cfg.dark, cfg.base, h * 2); else mixc(col, cfg.base, cfg.light, (h - 0.5) * 1.6);
      const m = ridged(N3, X * 2, Y * 2, Z * 2, Math.min(oct - 2, 8)); const t = smooth(0.55, 0.9, m) * 0.35; mixc(col, col, cfg.light, t);
      if (h < cfg.sea) { const s = h / cfg.sea; mixc(col, SEA_DEEP.rocky, SEA_SHALLOW.rocky, s * s); land = 0; }
      const c = crater(X, Y, Z, 0.7, 0.35, cfg.s, Lx, Ly) + crater(X, Y, Z, 0.23, 0.3, cfg.s + 50, Lx, Ly) + (oct > 7 ? crater(X, Y, Z, 0.06, 0.3, cfg.s + 90, Lx, Ly) : 0);
      const k = 1 + c * land; col[0] *= k; col[1] *= k; col[2] *= k;
      break;
    }
    case 'barren': {
      const maria = smooth(0.0, -0.25, fbm(N3, X * 0.6, Y * 0.6, Z * 0.6, 4));
      mixc(col, cfg.base, cfg.light, h * 0.8); mixc(col, col, cfg.dark, maria * 0.6);
      const c = crater(X, Y, Z, 1.1, 0.45, cfg.s, Lx, Ly) + crater(X, Y, Z, 0.4, 0.45, cfg.s + 50, Lx, Ly) + crater(X, Y, Z, 0.13, 0.5, cfg.s + 90, Lx, Ly) + (oct > 7 ? crater(X, Y, Z, 0.04, 0.5, cfg.s + 130, Lx, Ly) : 0);
      const k = 1 + c * 1.2; col[0] *= k; col[1] *= k; col[2] *= k;
      break;
    }
    case 'ice': {
      mixc(col, cfg.base, cfg.light, smooth(0.3, 0.8, h));
      const cr = ridged(N3, X * 3, Y * 3, Z * 3, Math.min(oct - 2, 8)); const t = Math.pow(cr, 9);
      mixc(col, col, [60, 110, 170], t * 0.7);
      if (h > 0.78) mixc(col, col, cfg.dark, (h - 0.78) * 2.5);
      mixc(col, col, [250, 252, 255], smooth(0.62, 0.8, lat + e * 0.2));
      break;
    }
    case 'lava': {
      mixc(col, cfg.dark, cfg.base, h);
      const cr = ridged(N3, X * 2.6, Y * 2.6, Z * 2.6, Math.min(oct - 2, 8)); const g = Math.pow(cr, 7) * (0.6 + (1 - h) * 0.8);
      const lake = smooth(0.32, 0.18, h);
      const em = Math.min(1.4, g * 1.6 + lake);
      mixc(col, col, [40, 12, 6], em * 0.5);
      o[3] = 255 * em; o[4] = 110 * em * em; o[5] = 30 * em * em * em;
      break;
    }
    case 'jungle': case 'ocean': case 'toxic': case 'desert': {
      const sea = cfg.sea;
      if (h < sea) {
        land = 0; const s = h / sea; mixc(col, SEA_DEEP[cfg.kind], SEA_SHALLOW[cfg.kind], s * s * s);
        if (cfg.kind === 'toxic') { const g = smooth(0.7, 1, s) * 0.5; o[4] = 60 * g; o[3] = 30 * g; }
      } else {
        const t = (h - sea) / (1 - sea);
        if (cfg.kind === 'desert') {
          const dune = Math.sin(X * 14 + fbm(N2, X * 2, Y * 2, Z * 2, 3) * 12) * 0.5 + 0.5;
          mixc(col, cfg.base, cfg.light, t * 0.7 + dune * 0.15);
          const cy = ridged(N3, X * 1.8, Y * 1.8, Z * 1.8, Math.min(oct - 2, 8)); mixc(col, col, cfg.dark, Math.pow(cy, 10) * 0.8);
        } else if (cfg.kind === 'toxic') {
          mixc(col, cfg.dark, cfg.light, t * 0.9);
          const m = fbm(N3, X * 4, Y * 4, Z * 4, 4); mixc(col, col, cfg.base, smooth(-0.1, 0.3, m) * 0.5);
        } else {
          // greens near the coast and in the lowlands, brown hills, grey-white peaks
          const forest = fbm(N3, X * 3, Y * 3, Z * 3, Math.min(oct - 2, 8)) * 0.5 + 0.5;
          if (cfg.kind === 'ocean') mixc(col, [92, 128, 62], [52, 86, 40], forest * 0.8);   // islands: green, not the sea's blue
          else mixc(col, cfg.base, cfg.dark, forest * 0.7);
          if (t < 0.04) mixc(col, col, [200, 190, 140], (0.04 - t) * 15);
          if (t > 0.55) mixc(col, col, [120, 100, 76], smooth(0.55, 0.8, t));
          if (t > 0.82) mixc(col, col, [235, 235, 240], smooth(0.82, 0.95, t));
        }
      }
      if (cfg.kind !== 'desert' && cfg.kind !== 'toxic') mixc(col, col, [245, 248, 252], smooth(0.8, 0.92, lat + e * 0.15));
      else if (cfg.kind === 'desert') mixc(col, col, [245, 240, 230], smooth(0.9, 0.97, lat));
      break;
    }
    case 'crystal': {
      facets(X * 3, Y * 3, Z * 3, cfg.s, FAC);
      mixc(col, cfg.dark, cfg.base, FAC[0]); mixc(col, col, cfg.light, smooth(0.6, 1, FAC[0]) * 0.5);
      const shade = 0.75 + h * 0.5; col[0] *= shade; col[1] *= shade; col[2] *= shade;
      const edge = smooth(0.12, 0, FAC[1]); const g = cfg.glow;
      o[3] = g[0] * edge * 0.8; o[4] = g[1] * edge * 0.8; o[5] = g[2] * edge * 0.8;
      mixc(col, col, cfg.light, edge * 0.5);
      break;
    }
    default: mixc(col, cfg.dark, cfg.light, h);
  }
  // fine grain in low orbit, so a close-up of the ground is never a smooth smear (features ~6-20 texels across)
  if (tex < 3) {
    const F = cfg.p.r / (12 * tex);
    const gr = N3(nx * F + 0.5, ny * F + 0.5, nz * F + 0.5) * 0.6 + N2(nx * F * 2.7, ny * F * 2.7, nz * F * 2.7) * 0.4;
    const k = 1 + gr * 0.16 * smooth(3, 1, tex); o[0] *= k; o[1] *= k; o[2] *= k;
  }
  // civilization: city districts on land (inhabited worlds)
  if (cfg.inhabited && land) {
    const cm = smooth(0.12, 0.32, fbm(N3, X * 1.4 + 9, Y * 1.4, Z * 1.4, 4)) * smooth(0.25, 0.1, Math.abs(e)) ;
    if (cm > 0.01) {
      if (tex > 2.5) {
        // seen from far: a grey-brown tint and speckled lights
        mixc(col, col, [118, 112, 104], cm * 0.55);
        const sp = N2(X * 55, Y * 55, Z * 55);
        if (sp > 0.18 - cm * 0.25) { const k = cm * smooth(0.18, 0.5, sp + cm * 0.2); o[3] += 255 * k; o[4] += 196 * k; o[5] += 120 * k; }
      } else street(cfg, wx, wy, cm, tex, o);
    }
  }
}

/** Streets, blocks and buildings for low orbit (planet-local world units). */
function street(cfg, wx, wy, cm, tex, o) {
  const s = cfg.s;
  // districts of 480 units each get their own grid offset so the city is not one endless grid
  const dx0 = Math.floor(wx / 480), dy0 = Math.floor(wy / 480);
  const ox = h2(dx0, dy0, s) * 30, oy = h2(dx0, dy0, s + 5) * 30;
  const x = wx + ox, y = wy + oy;
  const MJ = 120, MN = 30;
  const mx = ((x % MJ) + MJ) % MJ, my = ((y % MJ) + MJ) % MJ, nx = ((x % MN) + MN) % MN, ny = ((y % MN) + MN) % MN;
  const dens = Math.min(1, cm * 1.6);   // fewer buildings toward the edge of a district
  const major = mx < 7 || my < 7, minor = nx < 2.6 || ny < 2.6;
  if (major || (minor && dens > 0.35)) {
    const c = major ? [52, 54, 60] : [72, 72, 76]; mixc(o, o, c, Math.min(1, 0.4 + dens));
    // lit roads: warm sodium glow, brighter lamp spots on the main roads
    const along = mx < 7 ? y : x; const lamp = major && ((along % 22) + 22) % 22 < 2.2 ? 1 : 0;
    const k = (major ? 0.35 : 0.18) * dens + lamp * 0.9 * dens;
    o[3] += 255 * k; o[4] += 170 * k; o[5] += 70 * k;
    if (major && (mx > 3 && mx < 4 || my > 3 && my < 4)) mixc(o, o, [200, 190, 120], 0.35);   // lane line
    return;
  }
  // inside a block: maybe a building
  const bx = Math.floor(x / MN), by = Math.floor(y / MN); const hb = h2(bx, by, s + 11);
  if (hb > dens * 1.1) { mixc(o, o, [70, 92, 56], 0.35 * dens); return; }   // a park or empty lot
  const ins = 3 + h2(bx, by, s + 12) * 5; const lx = nx - 2.6, ly = ny - 2.6, side = MN - 2.6;
  if (lx > ins && ly > ins && lx < side - ins && ly < side - ins) {
    const tone = h2(bx, by, s + 13);
    const roof = tone < 0.33 ? [150, 146, 140] : tone < 0.66 ? [116, 120, 132] : [160, 120, 96];
    mixc(o, o, roof, 0.9);
    // roof edge highlight + a few rooftop units
    if (lx - ins < 1.2 || ly - ins < 1.2) mixc(o, o, [230, 230, 236], 0.35);
    // windows at night: some rooms lit
    const wxi = Math.floor(lx / 3), wyi = Math.floor(ly / 3);
    if (h2(wxi + bx * 13, wyi + by * 17, s + 14) < 0.22) { const k = 0.5 * dens; o[3] += 255 * k; o[4] += 214 * k; o[5] += 150 * k; }
  } else {
    // ground round the building: a shadow on the side away from the sun
    const hgt = 3 + h2(bx, by, s + 15) * 7; const sx = lx + cfg.L2[0] * hgt, sy = ly + cfg.L2[1] * hgt;
    const inShadow = sx > ins && sy > ins && sx < side - ins && sy < side - ins;
    mixc(o, o, inShadow ? [40, 40, 44] : [96, 96, 92], 0.7);
  }
}

// ---------------------------------------------------------------- the module
export function createPlanets(R) {
  const P = new Map();   // planet id → state
  const tiles = new Map(); let frame = 0;
  const TILE = 128;
  const O = new Float32Array(6);

  function state(p, w) {
    let st = P.get(p.id); if (st && st.p === p) return st;
    // Planet ids ('p0', 'p1'…) repeat in every system. The frame that jumps still draws the OLD world once after
    // setSystem() cleared the cache, so a state keyed by id alone was then reused for the NEW system's planet: the
    // last system's picture on this planet, and detail tiles sampled at the old radius drawn at the new one
    // (live reports #56/#63: "texture glitching", "double-rendering at a smaller scale"). Same object or rebuild.
    if (st) for (const [k, tt] of tiles) if (tt.pid === p.id) tiles.delete(k);
    const cfg = makeCfg(p, w.sun);
    st = { p, cfg, base: null, lights: null, clouds: null, shade: makeShade(cfg), air: makeAir(cfg), ring: cfg.ring ? makeRing(cfg) : null, job: null, twinkle: [], scorch: [], ready: false };
    st.job = baseJob(st);
    P.set(p.id, st); return st;
  }

  /** The day/night shade: black with alpha = how dark (drawn over surface and clouds). */
  function makeShade(cfg) {
    const S = 192; const c = mk(S, S); const g = c.getContext('2d'); const img = g.createImageData(S, S); const [Lx, Ly, Lz] = cfg.L;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1; const d2 = u * u + v * v; if (d2 > 1.02) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d2)); const ndl = u * Lx + v * Ly + nz * Lz;
      const lit = smooth(-0.14, 0.32, ndl) * (0.55 + 0.45 * clamp01(ndl * 1.4)) ;
      const limb = 0.85 + 0.15 * nz;   // a little darker toward the edge
      const k = 0.07 + 0.93 * lit * limb;
      const o = (j * S + i) * 4; img.data[o] = 0; img.data[o + 1] = 2; img.data[o + 2] = 8; img.data[o + 3] = 255 * (1 - k);
    }
    g.putImageData(img, 0, 0); return c;
  }
  /** The thin air: a glow just outside the rim and a haze just inside it, brighter toward the sun. */
  function makeAir(cfg) {
    if (!cfg.look.airK) return null;
    const S = 256, K = 1.22; const c = mk(S, S); const g = c.getContext('2d'); const img = g.createImageData(S, S);
    const [ar, ag, ab] = cfg.airCol; const [Lx, Ly] = cfg.L2; const thick = cfg.look.airK;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = ((i + 0.5) / S * 2 - 1) * K, v = ((j + 0.5) / S * 2 - 1) * K; const d = Math.hypot(u, v);
      let a;
      if (d > 1) a = Math.exp(-(d - 1) / (0.03 + 0.025 * thick)) * 0.5;
      else a = Math.pow(d, 10 - thick * 3) * 0.32;
      const face = d > 0 ? (u * Lx + v * Ly) / d : 0;
      const sunSide = 0.12 + 0.88 * smooth(-0.45, 0.7, face);
      a *= sunSide * Math.min(1, thick);
      if (a < 0.004) continue;
      const o = (j * S + i) * 4; const warm = d > 1 ? smooth(0.2, -0.3, face) * 0.35 : 0;   // a touch of sunset red along the terminator
      img.data[o] = Math.min(255, ar + (255 - ar) * warm); img.data[o + 1] = ag * (1 - warm * 0.4); img.data[o + 2] = ab * (1 - warm * 0.6); img.data[o + 3] = 255 * Math.min(1, a);
    }
    g.putImageData(img, 0, 0); return { c, K };
  }
  function makeRing(cfg) {
    const S = 512, Ri = 0.62, Ro = 1; const c = mk(S, S); const g = c.getContext('2d'); const img = g.createImageData(S, S);
    const r = rng(hash(cfg.s, 'ring')); const N = perlin3(cfg.s + 77); const tint = cfg.light;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1; const d = Math.hypot(u, v); if (d < Ri || d > Ro) continue;
      const t = (d - Ri) / (Ro - Ri);
      const band = N(t * 30, 0.5, 0.5) * 0.5 + 0.5; const fine = N(t * 140, 3.3, 1.1) * 0.5 + 0.5;
      let a = (0.25 + band * 0.55) * (0.7 + fine * 0.3) * smooth(0, 0.05, t) * smooth(1, 0.9, t);
      if (t > 0.55 && t < 0.6) a *= 0.15;   // a gap
      const o = (j * S + i) * 4; img.data[o] = tint[0] * (0.8 + band * 0.3); img.data[o + 1] = tint[1] * (0.8 + band * 0.25); img.data[o + 2] = tint[2] * (0.75 + band * 0.2); img.data[o + 3] = 255 * a * 0.85;
    }
    g.putImageData(img, 0, 0); void r; return c;
  }

  /** The base picture (whole disc), made a few rows per frame. */
  function* baseJob(st) {
    const cfg = st.cfg, p = st.p; const S = R.quality >= 1 ? 512 : 384;
    const c = mk(S, S); const g = c.getContext('2d'); const img = g.createImageData(S, S);
    const lc = mk(S, S); const lg = lc.getContext('2d'); const limg = lg.createImageData(S, S); let anyLight = false;
    const tex = p.r * 2 / S; const oct = Math.max(4, Math.min(7, Math.round(Math.log2(p.r / (cfg.scale * 2 * tex)))));
    const [Lx, Ly, Lz] = cfg.L; const tw = rng(hash(cfg.s, 'twinkle'));
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1; const d2 = u * u + v * v; if (d2 > 1.0) continue;
        const nz = Math.sqrt(1 - d2);
        sample(cfg, u, v, nz, u * p.r, v * p.r, oct, tex, O);
        const o = (j * S + i) * 4;
        img.data[o] = O[0]; img.data[o + 1] = O[1]; img.data[o + 2] = O[2]; img.data[o + 3] = 255;
        if (O[3] + O[4] + O[5] > 3) {
          // emissive: lava always glows (brighter at night); city lights only show on the night side
          const night = 1 - smooth(-0.14, 0.32, u * Lx + v * Ly + nz * Lz);
          const k = cfg.kind === 'lava' || cfg.kind === 'crystal' ? 0.45 + 0.55 * night : night;
          if (k > 0.02) {
            limg.data[o] = Math.min(255, O[3] * k); limg.data[o + 1] = Math.min(255, O[4] * k); limg.data[o + 2] = Math.min(255, O[5] * k); limg.data[o + 3] = 255; anyLight = true;
            if (cfg.inhabited && night > 0.6 && st.twinkle.length < 220 && tw() < 0.03) st.twinkle.push([u, v]);
          }
        }
      }
      if ((j & 7) === 7) yield;
    }
    g.putImageData(img, 0, 0); if (anyLight) lg.putImageData(limg, 0, 0);
    st.base = c; st.lights = anyLight ? lc : null; st.S = S;
    for (const sc of st.scorch) scorchOn(st.base, S / (p.r * 2), p.r, sc);
    yield;
    // clouds (unlit; the shade darkens them on the night side)
    if (cfg.look.clouds > 0) {
      const CS = R.quality >= 1 ? 320 : 224; const cc = mk(CS, CS); const cg = cc.getContext('2d'); const cimg = cg.createImageData(CS, CS);
      const N = perlin3(cfg.s + 303); const N2 = perlin3(cfg.s + 404); const [cr, cgc, cb] = hx(cfg.look.cloud); const cover = cfg.look.clouds;
      for (let j = 0; j < CS; j++) {
        for (let i = 0; i < CS; i++) {
          const u = (i + 0.5) / CS * 2 - 1, v = (j + 0.5) / CS * 2 - 1; const d2 = u * u + v * v; if (d2 > 1) continue;
          const nz = Math.sqrt(1 - d2); const X = u * 2.2, Y = v * 2.2 * 1.25, Z = nz * 2.2;   // stretched a bit: weather streams
          const wv = fbm(N2, X, Y, Z, 2) * 1.2;
          const n = fbm(N, X + wv, Y + wv * 0.5, Z, 5);
          const thr = 0.66 - cover * 0.3; let a = smooth(thr, thr + 0.22, n * 0.5 + 0.5);
          a *= 0.92 * smooth(1, 0.94, Math.sqrt(d2)) + 0.08;
          if (a < 0.01) continue;
          const o = (j * CS + i) * 4; cimg.data[o] = cr; cimg.data[o + 1] = cgc; cimg.data[o + 2] = cb; cimg.data[o + 3] = 255 * a * 0.82;
        }
        if ((j & 15) === 15) yield;
      }
      cg.putImageData(cimg, 0, 0); st.clouds = cc;
    }
    st.ready = true;
  }

  /** A detail tile for low orbit. tw = world units per texel. */
  function makeTile(st, level, ix, iy) {
    const cfg = st.cfg, p = st.p; const tw = 2 ** level; const TS = TILE * tw;
    const c = mk(TILE, TILE); const g = c.getContext('2d'); const img = g.createImageData(TILE, TILE);
    let lc = null, limg = null;
    const oct = Math.max(5, Math.min(11, Math.round(Math.log2(p.r / (cfg.scale * 2 * tw))) + 1));
    const [Lx, Ly, Lz] = cfg.L; const x0 = ix * TS, y0 = iy * TS; let any = false;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const wx = x0 + (i + 0.5) * tw, wy = y0 + (j + 0.5) * tw; const u = wx / p.r, v = wy / p.r; const d2 = u * u + v * v; if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      sample(cfg, u, v, nz, wx, wy, oct, tw, O);
      const o = (j * TILE + i) * 4; img.data[o] = O[0]; img.data[o + 1] = O[1]; img.data[o + 2] = O[2]; img.data[o + 3] = 255;
      if (O[3] + O[4] + O[5] > 3) {
        const night = 1 - smooth(-0.14, 0.32, u * Lx + v * Ly + nz * Lz);
        const k = cfg.kind === 'lava' || cfg.kind === 'crystal' ? 0.45 + 0.55 * night : night;
        if (k > 0.02) {
          if (!limg) { lc = mk(TILE, TILE); limg = lc.getContext('2d').createImageData(TILE, TILE); }
          limg.data[o] = Math.min(255, O[3] * k); limg.data[o + 1] = Math.min(255, O[4] * k); limg.data[o + 2] = Math.min(255, O[5] * k); limg.data[o + 3] = 255; any = true;
        }
      }
    }
    g.putImageData(img, 0, 0); if (any) lc.getContext('2d').putImageData(limg, 0, 0); else lc = null;
    const t = { c, lc, x0, y0, TS, level, used: frame, pid: p.id };
    for (const sc of st.scorch) if (sc.x > x0 - 20 && sc.y > y0 - 20 && sc.x < x0 + TS + 20 && sc.y < y0 + TS + 20) scorchTile(t, sc);
    return t;
  }
  function scorchOn(canvas, k, rr, sc) {   // k = texels per world unit; scorch in planet-local world coords
    const g = canvas.getContext('2d'); g.fillStyle = 'rgba(20,12,8,0.28)';
    g.beginPath(); g.arc((sc.x + rr) * k, (sc.y + rr) * k, Math.max(0.7, sc.r * k), 0, 7); g.fill();
  }
  function scorchTile(t, sc) {
    const g = t.c.getContext('2d'); const k = TILE / t.TS;
    g.fillStyle = 'rgba(24,14,8,0.3)'; g.beginPath(); g.arc((sc.x - t.x0) * k, (sc.y - t.y0) * k, Math.max(0.8, sc.r * k), 0, 7); g.fill();
    g.fillStyle = 'rgba(10,6,4,0.25)'; g.beginPath(); g.arc((sc.x - t.x0) * k, (sc.y - t.y0) * k, Math.max(0.5, sc.r * k * 0.5), 0, 7); g.fill();
  }

  const api = {
    clear() { P.clear(); tiles.clear(); },
    /** A mining laser burn on the surface (planet-local position from world x, y). */
    scorch(p, x, y) {
      const st = P.get(p.id); if (!st || st.p !== p) return;
      const sc = { x: x - p.x, y: y - p.y, r: 3 + Math.random() * 3 };
      if (st.scorch.length > 3000) st.scorch.shift();
      st.scorch.push(sc);
      if (st.base) scorchOn(st.base, st.S / (p.r * 2), p.r, sc);
      for (const t of tiles.values()) if (t.pid === p.id && sc.x > t.x0 - 10 && sc.y > t.y0 - 10 && sc.x < t.x0 + t.TS + 10 && sc.y < t.y0 + t.TS + 10) scorchTile(t, sc);
    },
    /** Start every planet's picture as soon as the system loads (nearest first). */
    prepare(w) { for (const p of w.planets || []) state(p, w); },
    /**
     * Draw all planets. g has the world transform set; z = screen px per world unit; view = { cx, cy, W, H }.
     */
    draw(g, w, cam, z, W, H, t, light) {
      frame++;
      const budget = performance.now() + (R.quality >= 1 ? 7 : 5);
      const planets = w.planets || [];
      // work: base pictures first (nearest planet first), even off screen, so they are ready when you get there
      const order = planets.map(p => [p, Math.hypot(p.x - cam.x, p.y - cam.y) - p.r]).sort((a, b) => a[1] - b[1]);
      for (const [p] of order) { const st = state(p, w); while (st.job && performance.now() < budget) { if (st.job.next().done) st.job = null; } }
      const want = [];
      for (const [p, dist] of order) {
        const st = state(p, w); const cfg = st.cfg;
        const halfW = W / 2 / z, halfH = H / 2 / z;
        // drop tiles of planets far away
        if (dist > Math.max(halfW, halfH) * 3 + 4000) { for (const [k, tt] of tiles) if (tt.pid === p.id) tiles.delete(k); }
        const reach = p.r * (st.ring ? 2.4 : 1.3);
        if (Math.abs(p.x - cam.x) > halfW + reach || Math.abs(p.y - cam.y) > halfH + reach) continue;
        if (st.ring) drawRing(g, st, t, true);
        // the surface, clipped to the disc
        g.save(); g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.clip();
        if (st.base) g.drawImage(st.base, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        else {
          const gr = g.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.1, p.x, p.y, p.r);
          gr.addColorStop(0, `rgb(${cfg.light})`); gr.addColorStop(0.6, `rgb(${cfg.base})`); gr.addColorStop(1, `rgb(${cfg.dark})`);
          g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        }
        // low orbit: detail tiles where the base picture would look soft
        const texBase = p.r * 2 / (st.S || 512);
        let lvlTiles = null;
        if (st.base && texBase * z > 1.4) {
          const level = Math.max(-1, Math.min(6, Math.floor(Math.log2(1.15 / z))));
          const TS = TILE * 2 ** level;
          const lx0 = Math.max(-p.r, cam.x - halfW - p.x), lx1 = Math.min(p.r, cam.x + halfW - p.x), ly0 = Math.max(-p.r, cam.y - halfH - p.y), ly1 = Math.min(p.r, cam.y + halfH - p.y);
          if (lx1 > lx0 && ly1 > ly0) {
            lvlTiles = [];
            for (let iy = Math.floor(ly0 / TS); iy <= Math.floor(ly1 / TS); iy++) for (let ix = Math.floor(lx0 / TS); ix <= Math.floor(lx1 / TS); ix++) {
              // skip tiles fully outside the disc
              const nx = Math.max(ix * TS, Math.min(0, (ix + 1) * TS)), ny = Math.max(iy * TS, Math.min(0, (iy + 1) * TS));
              if (nx * nx + ny * ny > p.r * p.r) continue;
              const key = `${p.id}:${level}:${ix}:${iy}`; const tt = tiles.get(key);
              if (tt) { tt.used = frame; lvlTiles.push(tt); }
              else {
                // a coarser tile already made stands in until this one is ready
                const pk = `${p.id}:${level + 1}:${Math.floor(ix / 2)}:${Math.floor(iy / 2)}`; const parent = tiles.get(pk);
                if (parent) { parent.used = frame; if (!lvlTiles.includes(parent)) lvlTiles.unshift(parent); }
                const cx = p.x + (ix + 0.5) * TS - cam.x, cy = p.y + (iy + 0.5) * TS - cam.y;
                want.push({ st, level, ix, iy, key, d: cx * cx + cy * cy });
              }
            }
            for (const tt of lvlTiles) g.drawImage(tt.c, p.x + tt.x0, p.y + tt.y0, tt.TS + 0.6 / z, tt.TS + 0.6 / z);
          }
        }
        // clouds drift round slowly; thinner when you are down low so the ground shows
        if (st.clouds) {
          g.save(); g.translate(p.x, p.y); g.rotate(t * 0.004 + (cfg.s % 100)); g.globalAlpha = Math.max(0.25, Math.min(1, 1.6 - texBase * z * 0.35));
          g.drawImage(st.clouds, -p.r, -p.r, p.r * 2, p.r * 2); g.restore(); g.globalAlpha = 1;
        }
        g.drawImage(st.shade, p.x - p.r * 1.01, p.y - p.r * 1.01, p.r * 2.02, p.r * 2.02);
        // emissive: city lights / lava / crystal edges, after the shade so they shine on the night side
        g.globalCompositeOperation = 'lighter';
        const flick = 0.88 + 0.12 * Math.sin(t * 0.9 + cfg.s);
        // the far-away light speckle fades out once the low-orbit tiles (with their own streets) take over
        const baseLights = lvlTiles ? Math.max(0, 1 - (texBase * z - 1.4) / 1.5) : 1;
        if (st.lights && baseLights > 0.01) { g.globalAlpha = flick * baseLights; g.drawImage(st.lights, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
        if (lvlTiles) { g.globalAlpha = 1; for (const tt of lvlTiles) if (tt.lc) g.drawImage(tt.lc, p.x + tt.x0, p.y + tt.y0, tt.TS + 0.6 / z, tt.TS + 0.6 / z); }
        g.globalAlpha = 1;
        // a few city lights twinkle
        if (st.twinkle.length && baseLights > 0.3) {
          const n = R.quality >= 1 ? 14 : 6; const tr = rng((frame >> 3) ^ cfg.s);
          for (let i = 0; i < n; i++) { const [u, v] = st.twinkle[Math.floor(tr() * st.twinkle.length)]; const s = (3 + tr() * 4) / Math.max(0.15, z) * 0.6; g.globalAlpha = 0.5 + tr() * 0.5; g.drawImage(glowSprite('#ffd9a0'), p.x + u * p.r - s, p.y + v * p.r - s, s * 2, s * 2); }
          g.globalAlpha = 1;
        }
        g.globalCompositeOperation = 'source-over';
        g.restore();
        // the air: thin rim glow
        if (st.air) {
          const K = st.air.K; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.95;
          g.drawImage(st.air.c, p.x - p.r * K, p.y - p.r * K, p.r * 2 * K, p.r * 2 * K);
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
        if (st.ring) drawRing(g, st, t, false);
      }
      // make the wanted tiles, nearest the middle of the screen first, within the time left
      want.sort((a, b) => a.d - b.d);
      for (const it of want) {
        if (performance.now() > budget + 2) break;
        tiles.set(it.key, makeTile(it.st, it.level, it.ix, it.iy));
      }
      // keep memory bounded
      const cap = R.quality >= 1 ? 170 : 90;
      if (tiles.size > cap) { const old = [...tiles.entries()].sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < tiles.size - cap; i++) tiles.delete(old[i][0]); }
    },
    /** Finish every picture now (tools/tests only): returns ms spent. */
    finish(w) { const t0 = performance.now(); for (const p of w.planets || []) { const st = state(p, w); while (st.job) { if (st.job.next().done) st.job = null; } } return performance.now() - t0; },
    stats() { return { planets: P.size, tiles: tiles.size, ready: [...P.values()].filter(s => s.ready).length, clouds: [...P.values()].filter(s => s.clouds).length, rings: [...P.values()].filter(s => s.ring).length }; },
  };

  function drawRing(g, st, t, back) {
    const p = st.p, cfg = st.cfg; const Ro = p.r * 2.3;
    g.save(); g.translate(p.x, p.y); g.rotate(cfg.ringAng); g.scale(1, cfg.ringTilt);
    // back half (above the planet's middle in ring space) is behind the planet, the front half is over it
    g.beginPath(); if (back) g.rect(-Ro, -Ro, Ro * 2, Ro); else g.rect(-Ro, 0, Ro * 2, Ro); g.clip();
    g.globalAlpha = back ? 0.75 : 0.9; g.drawImage(st.ring, -Ro, -Ro, Ro * 2, Ro * 2); g.globalAlpha = 1;
    // the planet's shadow across the ring, on the side away from the sun (clipped to the ring itself)
    g.beginPath(); g.arc(0, 0, Ro, 0, 7); g.arc(0, 0, Ro * 0.6, 0, 7, true); g.clip('evenodd');
    g.scale(1, 1 / cfg.ringTilt); g.rotate(-cfg.ringAng + Math.atan2(-cfg.L2[1], -cfg.L2[0]));
    g.fillStyle = 'rgba(0,0,6,0.72)'; g.fillRect(0, -p.r * 0.97, Ro * 1.2, p.r * 1.94);
    g.restore();
  }
  return api;
}
