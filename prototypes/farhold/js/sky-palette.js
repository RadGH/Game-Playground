// Farhold round 23 — THE COLOUR OF THE SKY, as a table.
//
// Pure: no Three.js, no DOM, so the node tests can ask it what a sunset looks like.
//
//   const s = skyState(sunY, palette, { gloom, flash, space, rising });
//   s.zenith, s.upper, s.mid, s.low, s.horizon     // five bands up the sun side, top to bottom
//   s.aUpper, s.aMid, s.aLow, s.aHorizon            // the same four on the side AWAY from the sun
//   s.glow, s.sun, s.sunI                            // the halo round the star, its light, how strong
//   s.hemiSky, s.hemiGround, s.ambI                  // the fill light the ground sees
//   s.fog, s.exposure, s.dusk, s.stars, s.grade      // what the air and the camera do
//
// Every colour is `[r, g, b]` in 0..1 sRGB — what a colour picker shows. js/sky.js turns them into
// THREE.Color with `setRGB(r, g, b, SRGBColorSpace)`.
//
// WHY A TABLE AND NOT A FORMULA. The old sky was three colours — night, day and "dusk" — lerped by
// the height of the sun, which is why a sunset was one flat orange wash that went straight to black.
// A real one is layered: deep blue overhead, violet, rose, orange and gold at the horizon under the
// sun, while the other half of the sky has a blue band of the planet's own shadow with a pink belt
// above it. That is nine colours at every height of the sun, and they do not move together — the
// rose band arrives after the gold and leaves after it. Keyframes are the honest way to write that.
//
// The keys are the SUN'S HEIGHT (`sunDirection.y`, -1..1), not the hour: a Farhold world has an axial
// tilt and you can walk to another longitude, so the hour does not say how high the sun is.
//
// ALIEN WORLDS STAY ALIEN. The table is written for a blue-sky world. `recolour()` works out how far
// this planet's own palette (worldgen's `atmospherePalette`) sits from that blue, and turns the
// whole table round the colour wheel by that much — fully in the daytime, about half as much for
// the sunset bands. So a sulphur world's day is its own yellow and its sunset is a green-gold rather
// than an Earth sunset pasted onto a stranger's sky.

const EARTH_SKY = '#7fb4e8';

// ---------------------------------------------------------------- colour helpers (sRGB 0..1)

export function hex(h) {
  const s = String(h).replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** [h 0..360, s 0..1, l 0..1] */
export function toHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
export function fromHsl([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/** The signed gap between two hues, -180..180. */
export function hueGap(a, b) { return ((b - a + 540) % 360) - 180; }
const rotate = (c, deg, satK = 1) => { const [h, s, l] = toHsl(c); return fromHsl([h + deg, clamp01(s * satK), l]); };

// ---------------------------------------------------------------- the table

const BANDS = ['zenith', 'upper', 'mid', 'low', 'horizon', 'aUpper', 'aMid', 'aLow', 'aHorizon', 'glow', 'sun', 'hemiSky', 'hemiGround', 'fog', 'shadowTint', 'highTint'];
const NUMS = ['sunI', 'ambI', 'exposure', 'dusk', 'stars', 'split', 'sat'];

/**
 * Nine heights of the sun. Between two of them everything is interpolated, so the gold at the
 * horizon slides into orange and then rose rather than snapping.
 *
 * `sun` below the horizon is MOONLIGHT: js/sky.js swings the directional light to the antisolar
 * point once the sun is down, because a light shining up through the ground lights the undersides
 * of everything and nothing else. That is why a Farhold night used to be flat black with lit chins.
 */
export const SKY_TABLE = [
  { y: -1.00, zenith: '#040816', upper: '#060c20', mid: '#0a1428', low: '#0e1a32', horizon: '#121f3a',
    aUpper: '#060c20', aMid: '#0a1428', aLow: '#0e1a32', aHorizon: '#121f3a', glow: '#101830',
    sun: '#7a8cc4', sunI: 0.3, hemiSky: '#34487a', hemiGround: '#10141c', ambI: 0.46, fog: '#0d1628',
    exposure: 1.45, dusk: 0, stars: 1, shadowTint: '#1c2c60', highTint: '#b4c4ff', split: 0.14, sat: 0.92 },
  { y: -0.30, zenith: '#050a1c', upper: '#08102a', mid: '#0d1832', low: '#12203c', horizon: '#172644',
    aUpper: '#08102a', aMid: '#0d1832', aLow: '#12203c', aHorizon: '#172644', glow: '#182040',
    sun: '#7a8cc4', sunI: 0.28, hemiSky: '#34487a', hemiGround: '#10141c', ambI: 0.46, fog: '#101a2e',
    exposure: 1.42, dusk: 0.05, stars: 1, shadowTint: '#1c2c60', highTint: '#b4c4ff', split: 0.14, sat: 0.92 },
  { y: -0.14, zenith: '#070d26', upper: '#0e1638', mid: '#1c1c48', low: '#322455', horizon: '#4a2a5c',
    aUpper: '#0c1330', aMid: '#0f1834', aLow: '#141c3c', aHorizon: '#172040', glow: '#5a2e60',
    sun: '#7080b8', sunI: 0.18, hemiSky: '#3c4478', hemiGround: '#14141c', ambI: 0.44, fog: '#1c1c38',
    exposure: 1.3, dusk: 0.4, stars: 0.85, shadowTint: '#241e5a', highTint: '#d0a0ff', split: 0.16, sat: 1.0 },
  { y: -0.05, zenith: '#122050', upper: '#26307a', mid: '#58408c', low: '#aa507c', horizon: '#f27a48',
    aUpper: '#1c2a5e', aMid: '#2e3468', aLow: '#5c4a7a', aHorizon: '#28345c', glow: '#ff7a40',
    sun: '#ff6a3a', sunI: 0.03, hemiSky: '#6a64a0', hemiGround: '#221c24', ambI: 0.46, fog: '#4c3c5c',
    exposure: 1.2, dusk: 1, stars: 0.4, shadowTint: '#3a2a6a', highTint: '#ffb080', split: 0.2, sat: 1.12 },
  { y: 0.00, zenith: '#1e3a7a', upper: '#3a4c9a', mid: '#8a5a98', low: '#e26a5a', horizon: '#ffa248',
    aUpper: '#34488e', aMid: '#5e5a96', aLow: '#b07a98', aHorizon: '#5a6690', glow: '#ffb050',
    sun: '#ff8a40', sunI: 0.8, hemiSky: '#a08ab8', hemiGround: '#4a3430', ambI: 0.6, fog: '#b87a70',
    exposure: 1.08, dusk: 1, stars: 0.1, shadowTint: '#3a3070', highTint: '#ffb070', split: 0.22, sat: 1.15 },
  { y: 0.06, zenith: '#2a4a90', upper: '#4a64ac', mid: '#9a7aa8', low: '#f09060', horizon: '#ffc468',
    aUpper: '#4a64a8', aMid: '#7a82b0', aLow: '#c4a0a8', aHorizon: '#9aa0b8', glow: '#ffc070',
    sun: '#ffa860', sunI: 1.25, hemiSky: '#a8aad0', hemiGround: '#4e3e32', ambI: 0.6, fog: '#d0a488',
    exposure: 0.98, dusk: 0.75, stars: 0, shadowTint: '#2e3a66', highTint: '#ffc890', split: 0.18, sat: 1.1 },
  { y: 0.15, zenith: '#3456a6', upper: '#5278c0', mid: '#8aa2cc', low: '#e0b890', horizon: '#ffd8a0',
    aUpper: '#5a7cc0', aMid: '#8aa4cc', aLow: '#b8c0d0', aHorizon: '#c8ccd4', glow: '#ffd8a0',
    sun: '#ffd09a', sunI: 1.70, hemiSky: '#a8bce0', hemiGround: '#5a4c3c', ambI: 0.58, fog: '#d4cabc',
    exposure: 0.9, dusk: 0.35, stars: 0, shadowTint: '#2c3c5c', highTint: '#ffe0b8', split: 0.12, sat: 1.12 },
  { y: 0.35, zenith: '#2f5cb4', upper: '#4a7ecc', mid: '#7aa8dc', low: '#a8c8e6', horizon: '#c8dcee',
    aUpper: '#4a7ecc', aMid: '#7aa8dc', aLow: '#a8c8e6', aHorizon: '#c8dcee', glow: '#fff0d8',
    sun: '#fff0dc', sunI: 1.95, hemiSky: '#b8cff0', hemiGround: '#5a5648', ambI: 0.6, fog: '#bcd0e2',
    exposure: 0.82, dusk: 0.05, stars: 0, shadowTint: '#2c3f58', highTint: '#ffeccf', split: 0.08, sat: 1.12 },
  { y: 1.00, zenith: '#2a58b8', upper: '#4580d0', mid: '#74aae0', low: '#a4c8ea', horizon: '#c4dcf0',
    aUpper: '#4580d0', aMid: '#74aae0', aLow: '#a4c8ea', aHorizon: '#c4dcf0', glow: '#fffaf0',
    sun: '#fff6e8', sunI: 2.05, hemiSky: '#bcd4f2', hemiGround: '#5e5a4c', ambI: 0.6, fog: '#b8d0e6',
    exposure: 0.78, dusk: 0, stars: 0, shadowTint: '#2c3f58', highTint: '#ffeccf', split: 0.06, sat: 1.12 },
];

// parse once
const PARSED = SKY_TABLE.map(k => {
  const out = { y: k.y };
  for (const b of BANDS) out[b] = hex(k[b]);
  for (const n of NUMS) out[n] = k[n];
  return out;
});

/** Read the table at a sun height, blending the two keyframes either side. */
export function sampleTable(sunY) {
  const y = Math.max(-1, Math.min(1, sunY));
  let i = 0;
  while (i < PARSED.length - 2 && PARSED[i + 1].y <= y) i++;
  const a = PARSED[i], b = PARSED[i + 1];
  const t = clamp01((y - a.y) / (b.y - a.y || 1));
  const out = { y };
  for (const k of BANDS) out[k] = mix(a[k], b[k], t);
  for (const k of NUMS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/**
 * How this planet's sky differs from the blue the table was written for.
 * Returns `{ hue, sat, day }`: degrees to turn the wheel, a saturation ratio, and the palette's own
 * daytime colours for the bands to lean on.
 */
export function paletteShift(palette = {}) {
  const sky = hex(palette.sky || EARTH_SKY);
  const horizon = hex(palette.skyHorizon || '#c8dcee');
  const [h0, s0] = toHsl(hex(EARTH_SKY));
  const [h1, s1] = toHsl(sky);
  // a nearly grey sky has no real hue; do not spin the table round for it
  const hue = s1 < 0.08 ? 0 : hueGap(h0, h1);
  const sat = Math.max(0.35, Math.min(1.6, (s1 + 0.05) / (s0 + 0.05)));
  // a palette's `sky` is the colour of the sky as a whole; straight up is deeper and more saturated
  // than that, and the band just above the horizon is paler — so the gradient is built round it
  const [hs, ss, ls] = toHsl(sky);
  const zenith = fromHsl([hs, clamp01(ss * 1.2 + 0.05), clamp01(ls * 0.58)]);
  const upper = fromHsl([hs, clamp01(ss * 1.1), clamp01(ls * 0.8)]);
  return {
    hue, sat,
    day: {
      zenith, upper, mid: sky, low: mix(sky, horizon, 0.6),
      horizon: mix(horizon, [1, 1, 1], 0.12),
    },
  };
}

/** The table turned round to this world's colours. Pure; `shift` from `paletteShift`. */
function recolour(s, shift) {
  if (!shift || (Math.abs(shift.hue) < 0.5 && Math.abs(shift.sat - 1) < 0.02)) return s;
  // fully this world's colour at noon, about half of it at sunset, a little at night
  const dayW = smooth(0.08, 0.35, s.y);
  const turn = shift.hue * (0.55 + 0.45 * dayW) * (s.y < -0.2 ? 0.5 : 1);
  const satK = 1 + (shift.sat - 1) * (0.6 + 0.4 * dayW);
  const out = { ...s };
  for (const k of BANDS) {
    if (k === 'sun' || k === 'hemiGround') continue;   // starlight is starlight; the ground is the ground
    out[k] = rotate(s[k], turn, satK);
  }
  // and in the daytime, lean on the palette's actual sky so its tuned colours survive
  const lean = dayW * 0.75;
  if (lean > 0) {
    for (const k of ['zenith', 'upper', 'mid', 'low', 'horizon']) out[k] = mix(out[k], shift.day[k], lean);
    out.aUpper = mix(out.aUpper, shift.day.upper, lean);
    out.aMid = mix(out.aMid, shift.day.mid, lean);
    out.aLow = mix(out.aLow, shift.day.low, lean);
    out.aHorizon = mix(out.aHorizon, shift.day.horizon, lean);
    out.fog = mix(out.fog, mix(shift.day.low, shift.day.horizon, 0.5), lean);
  }
  return out;
}

const GLOOM_GREY = hex('#6a7079');
const SPACE_BLACK = hex('#01030a');

/**
 * Everything the sky, the fog and the lights need at this sun height, on this world, in this weather.
 *
 * env: { gloom 0..1 (heavy weather), flash 0..1 (lightning this frame), space 0..1 (how far up out
 *        of the atmosphere), shift (from paletteShift, cached by the caller), cloudGrey [r,g,b] }
 */
export function skyState(sunY, palette = {}, env = {}) {
  const shift = env.shift || paletteShift(palette);
  let s = recolour(sampleTable(sunY), shift);
  const gloom = clamp01(env.gloom ?? 0);
  const flash = clamp01(env.flash ?? 0);
  const space = clamp01(env.space ?? 0);

  if (gloom > 0) {
    // heavy weather steals the colour and the light — but a sunset under a storm still burns along
    // the horizon, where the cloud deck breaks, so the lowest bands keep more of theirs
    const grey = env.cloudGrey || GLOOM_GREY;
    const dark = 1 - gloom * 0.3;
    for (const k of ['zenith', 'upper', 'mid', 'aUpper', 'aMid', 'fog', 'hemiSky']) s[k] = scale(mix(s[k], grey, gloom * 0.65), dark);
    for (const k of ['low', 'aLow']) s[k] = scale(mix(s[k], grey, gloom * 0.55), dark);
    for (const k of ['horizon', 'aHorizon', 'glow']) s[k] = scale(mix(s[k], grey, gloom * 0.42), dark);
    s.sunI *= 1 - gloom * 0.7;
    s.ambI *= 1 - gloom * 0.35;
    s.sat *= 1 - gloom * 0.22;
    s.shadowTint = mix(s.shadowTint, hex('#3a4656'), gloom * 0.6);
    s.highTint = mix(s.highTint, hex('#dde4ea'), gloom * 0.6);
  }
  if (space > 0) {
    // climbing out of the air: the sky drains to black from the top down, and the last thing to go
    // is a thin blue limb along the horizon
    for (const k of ['zenith', 'upper', 'aUpper']) s[k] = mix(s[k], SPACE_BLACK, space);
    for (const k of ['mid', 'aMid', 'fog', 'hemiSky']) s[k] = mix(s[k], SPACE_BLACK, space * 0.9);
    for (const k of ['low', 'aLow', 'glow']) s[k] = mix(s[k], SPACE_BLACK, space * 0.75);
    for (const k of ['horizon', 'aHorizon']) s[k] = mix(s[k], SPACE_BLACK, space * 0.6);
    s.stars = Math.max(s.stars, space);
    s.ambI *= 1 - space * 0.4;
  }
  if (flash > 0) {
    const white = hex('#d8e4ff');
    for (const k of ['zenith', 'upper', 'mid', 'low', 'horizon', 'aUpper', 'aMid', 'aLow', 'aHorizon', 'fog', 'hemiSky']) s[k] = mix(s[k], white, flash * 0.7);
    s.ambI += flash * 0.8;
    s.exposure += flash * 0.35;
  }
  s.stars = clamp01(s.stars * (1 - clamp01(env.cloud ?? 0) * 0.95));
  s.gloom = gloom; s.space = space; s.flash = flash;
  return s;
}

/**
 * HEIGHT FOG — how thick, how quickly it thins with height, and how much it glows toward the sun.
 *
 * The fog shader (js/atmosphere.js) integrates `density * exp(-falloff * (y - base))` along the view
 * ray in closed form, so these three numbers are the whole of it. `base` is not here: it is the
 * height of the low ground around you, which only the terrain knows.
 *
 *   dawn   — a morning mist lying in the valleys: thicker and much lower. Only on the way UP
 *            (`rising`); an evening is clearer than a morning, which is how it works outside too.
 *   rain   — the whole column fills with spray, so it thickens and stops hugging the ground.
 *   fog    — the weather's own fog state, on top of the distance fog it already sets.
 *   space  — nothing. Climbing out of the atmosphere takes the fog with it, so orbit has no wall.
 */
export function fogFor(sunY, w = {}, { rising = true, space = 0, indoors = false } = {}) {
  if (indoors) return { density: 0, falloff: 0.01, inscatter: 0, amount: 0 };
  const rain = clamp01(w.rain ?? 0), fog = clamp01(w.fog ?? 0), snow = clamp01(w.snow ?? 0);
  const dust = clamp01(w.dust ?? 0), gloom = clamp01(w.gloom ?? 0);
  // a bell round the sun crossing the horizon — twilight and the first hour of light
  const twilight = Math.exp(-(((sunY - 0.04) / 0.12) ** 2));
  const dawn = rising ? twilight : twilight * 0.35;
  let density = 1 / 3400;
  density *= 1 + dawn * 2.4;
  density *= 1 + rain * 4.5 + snow * 3 + fog * 5.5 + dust * 3.5;
  // how many metres it takes to thin by e: low and heavy at dawn, a taller column in the rain
  const scaleHeight = 150 - dawn * 85 + rain * 90 + snow * 50 + fog * 20 + dust * 60;
  const inscatter = clamp01(0.95 - gloom * 0.7 - fog * 0.3);
  return {
    density,
    falloff: 1 / Math.max(30, scaleHeight),
    inscatter,
    amount: clamp01(1 - space),
  };
}

/**
 * What the colour grade does at this moment. Warm highlights and violet shadows at sunset, blue
 * moonlit shadows at night, washed-out and cool in a storm. The numbers come out of the same table
 * as the sky, so the picture and the sky can never disagree about what time it is.
 */
export function gradeFor(s) {
  return {
    shadowTint: s.shadowTint, highTint: s.highTint,
    split: s.split, saturation: s.sat, exposure: s.exposure,
    contrast: 1.08 + s.dusk * 0.02 - (s.gloom || 0) * 0.05,
    // bloom a little stronger when it is dark, where a lamp or a spell is the brightest thing
    bloom: 0.55 + (1 - clamp01(s.sunI / 1.2)) * 0.35,
  };
}
