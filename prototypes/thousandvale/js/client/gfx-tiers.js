// 2026-10-16 — graphics (G-ATMOS): what each graphics quality draws of the atmosphere, and the small pieces of maths
// the shaders and the per-frame code share. Pure (no three, no DOM) — tests/D/atmos.test.js reads it.
//
// Owner, 2026-10-16: "enhance the graphics in a way that still runs good on mobile". The quality setting (Settings →
// Graphics → Graphics quality: Automatic / Low / Medium / High; a phone starts on Medium, a software renderer on Low)
// picks one row. `?atmos=0` draws the world as it was before this round (for before / after measuring).
//
//   water        'basic'  depth colour and shore foam baked into the water's vertex colours (no extra shader work)
//                'shaded' one water shader: depth colour, two drifting ripple layers, sun glints, shore foam with waves
//                         rolling in, foam round piers and rocks — no reflection pass on any tier
//   cloudShadows soft cloud shadows sliding over the ground and water (one texture read per ground pixel)
//   mist         how many drifting wisps of low cloud / fog (one draw call for all of them; never near the player)
//   terrainAO    hollows and the foot of slopes a little darker (baked into the ground's vertex colours: free per frame)
//   contact      how dark the soft round shadow under each character is (one draw call; the only shadow on Low)
//   grade        warm highlights / cool shadows folded into the tone mapping (no extra pass)
//   vignette     a soft darkening of the screen's corners (a page overlay, not a WebGL pass)
//   bloom        a soft glow round bright things (lamps at night, the sun, spells) — one extra quarter-size pass; High only
//   clutter      grass tufts, ferns, small bushes, stones and lumps of earth round the camera (ground-clutter.js; how far
//                each layer reaches is clutter-plan.js CLUTTER_LAYERS) — about a dozen draw calls; not on Low

export const ATMOS_TIERS = Object.freeze({
  low:    Object.freeze({ water: 'basic',  sparkle: false, shoreWaves: false, cloudShadows: false, mist: 0,  terrainAO: true,  contact: 0.34, grade: false, vignette: 0.16, bloom: false, warmCool: true, clutter: false }),
  medium: Object.freeze({ water: 'shaded', sparkle: true,  shoreWaves: true,  cloudShadows: true,  mist: 8,  terrainAO: true,  contact: 0.24, grade: true,  vignette: 0.2,  bloom: false, warmCool: true, clutter: true }),
  high:   Object.freeze({ water: 'shaded', sparkle: true,  shoreWaves: true,  cloudShadows: true,  mist: 16, terrainAO: true,  contact: 0.2,  grade: true,  vignette: 0.2,  bloom: true,  warmCool: true, clutter: true }),
  // ?atmos=0: exactly the look before this round (the measuring baseline)
  off:    Object.freeze({ water: 'legacy', sparkle: false, shoreWaves: false, cloudShadows: false, mist: 0,  terrainAO: false, contact: 0,    grade: false, vignette: 0,    bloom: false, warmCool: false, clutter: false }),
});

/** The row for a quality ('low' | 'medium' | 'high'; anything else reads as high) and the page's `atmos` flag. */
export function atmosTier(quality, flag = null) {
  if (flag === '0' || flag === 'off' || flag === false) return ATMOS_TIERS.off;
  return ATMOS_TIERS[quality] || ATMOS_TIERS.high;
}

/** One line per tier for the Settings window (plain words). */
export function tierWords(quality) {
  const t = ATMOS_TIERS[quality]; if (!t) return '';
  const on = [];
  on.push(t.water === 'shaded' ? 'moving water with foam at the shore' : 'water with shallows and shore foam');
  if (t.cloudShadows) on.push('cloud shadows');
  if (t.mist) on.push('drifting mist');
  if (t.clutter) on.push('grass and stones on the ground');
  if (t.bloom) on.push('glow round lights');
  return on.join(', ');
}

// ---------------------------------------------------------------- water colour (shader and the Low tier's vertex colours)
export const WATER = Object.freeze({
  shallow: [0.06, 0.36, 0.34],        // linear RGB: turquoise over sand
  mid: [0.02, 0.17, 0.22],
  deep: [0.010, 0.065, 0.12],         // close to the far horizon's sea (#2a5468 lit) so the zone's sea meets it
  depthK: 0.3,                        // 1 - exp(-depth * k): how fast the colour deepens (m^-1)
  alphaShallow: 0.66, alphaDeep: 0.95,
  foamDepth: 0.12,                    // m: the sheet this shallow is foam (the band right at the waterline)
  foamWidth: 2.2,                     // m of foam at the waterline
  waveSpacing: 5.5, waveReach: 13,    // m between foam lines rolling in; how far out they start
});

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** How deep the colour reads, 0 (shallow) .. 1 (deep), for a water depth in metres (negative = over the bank). */
export function depthMix(depth) { return 1 - Math.exp(-Math.max(0, depth) * WATER.depthK); }

/** Linear RGB + alpha of the water at a depth (no foam). The shader does the same sums. */
export function waterColour(depth) {
  const k = depthMix(depth);
  const a = k < 0.5 ? WATER.shallow : WATER.mid, b = k < 0.5 ? WATER.mid : WATER.deep, f = k < 0.5 ? k * 2 : (k - 0.5) * 2;
  return { r: lerp(a[0], b[0], f), g: lerp(a[1], b[1], f), b: lerp(a[2], b[2], f), a: lerp(WATER.alphaShallow, WATER.alphaDeep, k) };
}

/** Steady foam (no waves): right at the waterline (`depth` m of water), a band `shore` m out from it, foam round objects. */
export function shoreFoam(shore, objFoam = 0, depth = 1) {
  const edge = (1 - smoothstep(0, WATER.foamDepth, depth)) * (1 - smoothstep(1.5, 3.5, shore)), band = (1 - smoothstep(0.8, 0.8 + WATER.foamWidth, shore)) * 0.85;
  return clamp01(Math.max(edge, band, objFoam));
}

/**
 * Metres from each water sample to the waterline: 0 where the ground under the sheet is at or above the surface (the
 * bank), counted outward over the sheet with 8-neighbour steps, capped at `cap` m. Samples with no sheet are NaN.
 * surf = water surface per sample (NaN = no sheet), grid = ground height, res = samples per side, step = metres.
 */
export function shoreDistance(surf, grid, res, step, cap = 32) {
  const N = res * res, d = new Float32Array(N).fill(Infinity);
  const q = []; let qh = 0;
  for (let k = 0; k < N; k++) {
    const s = surf[k];
    if (s !== s) { d[k] = NaN; continue; }
    if (grid[k] >= s - 0.05) { d[k] = 0; q.push(k); }
  }
  // the sheet's own edge (a sample beside one with no sheet) is a waterline too, unless the sheet goes on past the grid
  for (let k = 0; k < N; k++) {
    if (!(d[k] === Infinity)) continue;
    const i = k % res, j = (k - i) / res;
    if ((i > 0 && surf[k - 1] !== surf[k - 1]) || (i < res - 1 && surf[k + 1] !== surf[k + 1]) || (j > 0 && surf[k - res] !== surf[k - res]) || (j < res - 1 && surf[k + res] !== surf[k + res])) { d[k] = 0; q.push(k); }
  }
  // Dijkstra-lite: a breadth-first sweep with straight (1) and diagonal (1.414) steps, relaxing until settled, capped
  const D = Math.SQRT2 * step;
  while (qh < q.length) {
    const k = q[qh++], v = d[k];
    if (v >= cap) continue;
    const i = k % res, j = (k - i) / res;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= res || jj >= res) continue;
      const n = jj * res + ii, nv = v + (di && dj ? D : step);
      if (nv < d[n]) { d[n] = nv; q.push(n); }
    }
  }
  for (let k = 0; k < N; k++) if (d[k] === Infinity) d[k] = cap;
  return d;
}

// ---------------------------------------------------------------- terrain: baked hollows
/**
 * How much a ground sample is shaded by the land round it (1 = open, down to `floor`): the mean of the samples `near`
 * and `far` steps away minus its own height — a hollow or the foot of a slope is lower than its neighbours. H(i, j).
 */
export function hollowShade(H, i, j, { near = 3, far = 8, kNear = 0.06, kFar = 0.025, floor = 0.72 } = {}) {
  const h = H(i, j);
  const ring = r => (H(i + r, j) + H(i - r, j) + H(i, j + r) + H(i, j - r) + H(i + r, j + r) + H(i - r, j - r) + H(i + r, j - r) + H(i - r, j + r)) / 8;
  const occ = Math.max(0, ring(near) - h) * kNear + Math.max(0, ring(far) - h) * kFar;
  return Math.max(floor, 1 - occ);
}

// ---------------------------------------------------------------- light: warmer key, cooler fill
/** The sun warmed and the sky fill cooled a touch (linear RGB triples in, out). Night (moonlight) is left alone. */
export function warmCool(key, hemiSky, night = 0) {
  const k = 1 - clamp01(night * 1.4);
  const warm = [1.04, 1.0, 0.9], cool = [0.94, 0.99, 1.08];
  const mul = (c, m) => [c[0] * lerp(1, m[0], k), c[1] * lerp(1, m[1], k), c[2] * lerp(1, m[2], k)];
  return { key: mul(key, warm), hemiSky: mul(hemiSky, cool) };
}

// ---------------------------------------------------------------- cloud shadows
/** How dark a cloud's shadow is now (0 = none): none at night or underground, deeper on a cloudy day, gone as the sun sets. */
export function cloudShadowStrength({ night = 0, sunY = 1, weather = 'clear', dungeon = false } = {}) {
  if (dungeon) return 0;
  const day = 1 - clamp01(night * 1.6);
  const low = smoothstep(0.02, 0.25, sunY);
  return +(day * low * (weather === 'cloudy' ? 0.4 : 0.3)).toFixed(4);
}
export const CLOUD = Object.freeze({ scale: 1 / 420, wind: [5.5, 2.2] });     // one texture repeat per 420 m; m/s drift

// ---------------------------------------------------------------- the colour grade (folded into the tone mapping)
export const GRADE = Object.freeze({ warm: [1.035, 1.0, 0.94], cool: [0.95, 0.99, 1.06], sat: 1.06, pivot: 0.42 });
/**
 * The grade on a tone-mapped linear colour (0..1 each): shadows cooled, highlights warmed (split by luminance about
 * `pivot`), saturation nudged up. Mirrors the GLSL in atmos.js `gradeChunk`.
 */
export function gradeRGB([r, g, b]) {
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const t = smoothstep(0.05, GRADE.pivot * 2, L);
  const m = [0, 1, 2].map(i => lerp(GRADE.cool[i], GRADE.warm[i], t));
  let c = [r * m[0], g * m[1], b * m[2]];
  const L2 = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  c = c.map(v => clamp01(L2 + (v - L2) * GRADE.sat));
  return c;
}

// ---------------------------------------------------------------- mist
export const MIST = Object.freeze({ near: 55, far: [260, 380], life: [40, 85], size: [26, 64], lift: [2, 9], playerClear: 45, valley: 5, farFlat: 150 });
/**
 * May a wisp of mist stand here? Over water, in ground lower than where the player stands (a valley seen from
 * above), or `farFlat` m off over ground no higher than the player; never within `playerClear` m of the player. spot = { y, wet, dPlayer, focusY }.
 */
export function mistSpotOk({ y, wet = false, dPlayer, focusY }) {
  if (!(dPlayer >= MIST.playerClear)) return false;
  if (wet) return true;
  if (!Number.isFinite(y)) return false;
  // down in a valley, or far out over ground no higher than where you stand (a bank of mist lying over the fields)
  return y < focusY - MIST.valley || (dPlayer >= MIST.farFlat && y <= focusY + 2);
}
/** A wisp's opacity over its life (fade in, hold, fade out), times how far it is from the camera (none close up). */
export function mistAlpha(age, life, camDist, peak = 0.32) {
  const f = Math.min(smoothstep(0, 0.18, age / life), 1 - smoothstep(0.75, 1, age / life));
  return +(peak * f * smoothstep(MIST.near * 0.55, MIST.near, camDist)).toFixed(4);
}
