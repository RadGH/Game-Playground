// World Forge — weather.
//
// A map already knows a cell's temperature, moisture, height and biome. That is enough to say what
// the sky over it is usually doing, so this module turns climate into weather: a table of what can
// happen over a given cell, a roll against it, and a clock that walks from one state to the next
// instead of teleporting between them.
//
// Pure data and arithmetic — no DOM, no Three.js, no canvas — so the generator, the viewer, a game
// and the node tests all read the same model.
//
//   import { weatherWeights, rollWeather, WeatherClock, WEATHER_BY_KEY } from './weather.js';
//   const w = weatherWeights(cellClimate);       // { clear: 3.2, rain: 1.1, … }
//   const key = rollWeather(w, rng);             // 'rain'
//   const clock = new WeatherClock({ weights: w, seed: 7 });
//   clock.update(dt);                            // blend() crossfades into the next state
//
// The second half of the file is `atmospherePalette()`: the colours of a world's sky, sea and cloud,
// varied per planet so two lava worlds are not the same lava world.

import { makeRng, subSeed, clamp, lerp } from './noise.js';
import { BIOMES, isWater } from './biomes.js';

/**
 * The weather states. Every numeric field is 0..1 and is what a renderer actually reads:
 *   cloud      how much of the sky is covered
 *   rain/snow  precipitation rate (a state has one or the other, never both)
 *   dust       blown sand, ash or grit
 *   fog        ground haze, which is what cuts your view distance
 *   wind       how hard it is blowing
 *   lightning  strikes per minute, roughly
 *   gloom      how much light the sky steals even at noon
 */
export const WEATHER = [
  { key: 'clear',      name: 'Clear',          cloud: 0.04, rain: 0,    snow: 0,    dust: 0,    fog: 0,    wind: 0.12, lightning: 0,  gloom: 0 },
  { key: 'fair',       name: 'Fair',           cloud: 0.26, rain: 0,    snow: 0,    dust: 0,    fog: 0.02, wind: 0.2,  lightning: 0,  gloom: 0.04 },
  { key: 'cloudy',     name: 'Cloudy',         cloud: 0.58, rain: 0,    snow: 0,    dust: 0,    fog: 0.05, wind: 0.3,  lightning: 0,  gloom: 0.16 },
  { key: 'overcast',   name: 'Overcast',       cloud: 0.9,  rain: 0,    snow: 0,    dust: 0,    fog: 0.12, wind: 0.34, lightning: 0,  gloom: 0.34 },
  { key: 'drizzle',    name: 'Drizzle',        cloud: 0.82, rain: 0.28, snow: 0,    dust: 0,    fog: 0.24, wind: 0.3,  lightning: 0,  gloom: 0.38 },
  { key: 'rain',       name: 'Rain',           cloud: 0.94, rain: 0.66, snow: 0,    dust: 0,    fog: 0.28, wind: 0.45, lightning: 0.1, gloom: 0.5 },
  { key: 'storm',      name: 'Thunderstorm',   cloud: 1,    rain: 1,    snow: 0,    dust: 0,    fog: 0.32, wind: 0.85, lightning: 1,  gloom: 0.68 },
  { key: 'snow',       name: 'Snowfall',       cloud: 0.88, rain: 0,    snow: 0.6,  dust: 0,    fog: 0.3,  wind: 0.32, lightning: 0,  gloom: 0.4 },
  { key: 'blizzard',   name: 'Blizzard',       cloud: 1,    rain: 0,    snow: 1,    dust: 0,    fog: 0.72, wind: 1,    lightning: 0,  gloom: 0.62 },
  { key: 'fog',        name: 'Fog',            cloud: 0.5,  rain: 0,    snow: 0,    dust: 0,    fog: 0.9,  wind: 0.06, lightning: 0,  gloom: 0.44 },
  { key: 'sandstorm',  name: 'Sandstorm',      cloud: 0.4,  rain: 0,    snow: 0,    dust: 1,    fog: 0.8,  wind: 1,    lightning: 0,  gloom: 0.6 },
  { key: 'ashfall',    name: 'Ashfall',        cloud: 0.8,  rain: 0,    snow: 0,    dust: 0.65, fog: 0.5,  wind: 0.4,  lightning: 0.25, gloom: 0.66 },
  { key: 'emberstorm', name: 'Ember Storm',    cloud: 0.9,  rain: 0,    snow: 0,    dust: 0.85, fog: 0.42, wind: 0.95, lightning: 0.8, gloom: 0.7 },
  { key: 'ionstorm',   name: 'Ion Storm',      cloud: 0.7,  rain: 0,    snow: 0,    dust: 0.3,  fog: 0.3,  wind: 0.7,  lightning: 1,  gloom: 0.5 },
];

export const WEATHER_BY_KEY = Object.fromEntries(WEATHER.map(w => [w.key, w]));
export const WEATHER_KEYS = WEATHER.map(w => w.key);

/** Map colours for the weather layer — bright and dry at one end, dark and violent at the other. */
export const WEATHER_COLOR = {
  clear: '#7fc8f0', fair: '#a8d8f0', cloudy: '#c0c8d0', overcast: '#8a929c',
  drizzle: '#6f93b0', rain: '#4a7fb0', storm: '#33447a',
  snow: '#e8f0f8', blizzard: '#b4ccdc', fog: '#b0b4b8',
  sandstorm: '#d8b070', ashfall: '#6a5f58', emberstorm: '#b4502a', ionstorm: '#a070d0',
};

/** Every state blended to nothing — the shape a renderer can always rely on. */
export const CALM = { cloud: 0, rain: 0, snow: 0, dust: 0, fog: 0, wind: 0, lightning: 0, gloom: 0 };
const FIELDS = Object.keys(CALM);

/**
 * How likely each kind of weather is over one place.
 *
 * `climate` is anything with the fields a world map already carries:
 *   { temperature, moisture, elevation, biome (id), water (0|1|2), aura, volcanic, liquid, archetype }
 * Everything is optional; missing fields fall back to a temperate, damp, sea-level default.
 *
 * Returns a plain object of key → weight. Weights are relative, not probabilities.
 */
export function weatherWeights(climate = {}) {
  const temp = clamp(climate.temperature ?? 0.5, 0, 1);
  const moist = clamp(climate.moisture ?? 0.5, 0, 1);
  const elev = clamp(climate.elevation ?? 0.6, 0, 1);
  const aura = climate.aura ?? 0;
  const biomeId = climate.biome;
  const biome = Number.isInteger(biomeId) ? BIOMES[biomeId] : null;
  const tags = biome?.tags || [];
  const wet = climate.water ? true : false;
  const liquid = climate.liquid ?? 'water';
  const arch = climate.archetype || null;

  // a dry world has nothing to rain with, whatever its map says about moisture
  const canRain = liquid === 'water';
  const cold = 1 - temp;
  const height = Math.max(0, elev - 0.5) * 2;      // 0 at sea level, 1 at the highest ground

  const w = {};
  const add = (key, value) => { if (value > 0) w[key] = (w[key] || 0) + value; };

  // the everyday states, everywhere
  add('clear', 2.4 + (1 - moist) * 3.4 + temp * 0.6);
  add('fair', 2.6 + (1 - Math.abs(moist - 0.5) * 2) * 1.4);
  add('cloudy', 1.2 + moist * 3.2);
  add('overcast', 0.5 + moist * 2.6 + (wet ? 0.6 : 0));

  if (canRain) {
    // rain wants moisture and warmth; above freezing it falls as water, below it as snow
    const fall = Math.max(0, moist - 0.28) * 3.2 + (wet ? 0.5 : 0);
    const warm = clamp((temp - 0.3) * 2.6, 0, 1);
    add('drizzle', fall * 0.8 * warm);
    add('rain', fall * 1.15 * warm);
    // storms need heat as well as water — they are an engine, not just a cloud
    add('storm', fall * 0.55 * clamp((temp - 0.52) * 3, 0, 1) * (1 + (tags.includes('hot') ? 0.6 : 0)));
    /**
     * NOT ON SAND.
     *
     * "I'm in the desert and the weather seems like its snowing." Snow already wanted cold and damp,
     * and a hot desert supplies neither — but a COLD desert (high, polar, or a badland at altitude)
     * clears the temperature test, and `wet` ground nearby was enough to give it something to fall.
     * A place defined by having no water does not get snowfall, whatever the arithmetic says, so the
     * arid biomes are excluded outright rather than left to a threshold.
     */
    const arid = ['desert', 'dunes', 'badlands', 'ashPlain', 'sand', 'scorched']
      .some(k => biome?.key === k || tags.includes(k));
    const freezing = clamp((0.34 - temp) * 5, 0, 1) * (arid ? 0 : 1);
    add('snow', fall * 1.1 * freezing);
    add('blizzard', fall * 0.5 * freezing * (0.35 + height * 1.3 + (tags.includes('harsh') ? 0.4 : 0)));
  }

  // fog sits in wet hollows and cold air, and hates a hilltop
  add('fog', (moist * 1.6 + (wet ? 0.9 : 0) + cold * 0.7) * (1 - height * 0.75) * (tags.includes('marsh') || biome?.key === 'marsh' ? 2.2 : 1));

  // dry, hot and open ground blows dust
  if (moist < 0.42 && temp > 0.45) add('sandstorm', (0.42 - moist) * 6 * clamp((temp - 0.45) * 2.4, 0, 1));
  // volcanic ground, lava worlds and ash plains throw ash
  const volcanic = (climate.volcanic ? 1 : 0) + (biome?.key === 'volcanic' || biome?.key === 'ashPlain' ? 1 : 0) + (arch === 'lava' ? 1.4 : 0) + (liquid === 'lava' ? 1 : 0);
  if (volcanic > 0) { add('ashfall', volcanic * 1.9); add('emberstorm', volcanic * 0.85 * (0.4 + temp)); }
  // raw magic and void-touched ground gets storms of the wrong kind
  const charged = Math.max(0, (climate.magic ?? 0) - 0.4) * 2 + Math.max(0, aura) * 0.8 + (arch === 'voidTouched' ? 1.2 : 0) + (tags.includes('magic') ? 0.9 : 0);
  if (charged > 0) add('ionstorm', charged * 1.5);

  // water cells never report ground-only weather
  if (Number.isInteger(biomeId) && isWater(biomeId)) { delete w.sandstorm; }
  return w;
}

/** Pick one state from a weight table. */
export function rollWeather(weights, rng = makeRng(1)) {
  const entries = Object.entries(weights).filter(([, v]) => v > 0);
  if (!entries.length) return 'clear';
  let total = 0;
  for (const [, v] of entries) total += v;
  let r = rng() * total;
  for (const [key, v] of entries) { r -= v; if (r <= 0) return key; }
  return entries[entries.length - 1][0];
}

/** The weight table as percentages, highest first — for a readout or a tooltip. */
export function weatherOdds(weights) {
  const entries = Object.entries(weights).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return entries
    .map(([key, v]) => ({ key, name: WEATHER_BY_KEY[key]?.name || key, share: v / total }))
    .sort((a, b) => b.share - a.share);
}

/** The single most likely state over a place — what a map layer paints. */
export function dominantWeather(weights) {
  return weatherOdds(weights)[0]?.key || 'clear';
}

/** The climate of one world-map cell, in the shape `weatherWeights` wants. */
export function cellClimate(world, x, y) {
  const w = world.width;
  const i = y * w + x;
  return {
    temperature: world.temperature[i], moisture: world.moisture[i], elevation: world.elevation[i],
    biome: world.biome[i], water: world.water[i], aura: world.aura?.[i] ?? 0, magic: world.magic?.[i] ?? 0,
    volcanic: world.volcanic?.[i] ?? 0, liquid: world.opts?.liquid ?? 'water',
    archetype: world.planet?.archetype || null,
  };
}

/** Weather odds over a world-map cell, straight from the world. */
export function weatherAt(world, x, y) {
  return weatherWeights(cellClimate(world, x, y));
}

/**
 * Weather that changes over time instead of flicking between states.
 *
 * `blend()` returns the renderer's numbers (cloud, rain, wind…) crossfaded between the state it is
 * leaving and the one it is moving to, so a storm rolls in rather than appearing.
 */
export class WeatherClock {
  /**
   * opts: { weights, seed, minMinutes, maxMinutes, transitionSeconds, start }
   * `minMinutes`/`maxMinutes` are how long a state holds, in real minutes.
   */
  constructor({ weights = { clear: 1 }, seed = 1, minMinutes = 1.5, maxMinutes = 5, transitionSeconds = 22, start = null } = {}) {
    this.rng = makeRng(subSeed(seed >>> 0, 'weather'));
    this.weights = weights;
    this.minMinutes = minMinutes;
    this.maxMinutes = maxMinutes;
    this.transitionSeconds = transitionSeconds;
    this.current = start && WEATHER_BY_KEY[start] ? start : rollWeather(weights, this.rng);
    this.next = null;
    this.progress = 1;
    this.held = 0;
    this.holdFor = this._holdLength();
    this.locked = false;
  }

  _holdLength() { return (this.minMinutes + this.rng() * (this.maxMinutes - this.minMinutes)) * 60; }

  /** Change what is possible here — called when the player walks into a different climate. */
  setWeights(weights) { this.weights = weights; }

  /** Force a state. `lock` stops the clock rolling anything else (the debug menu uses it). */
  set(key, { lock = false, instant = false } = {}) {
    if (!WEATHER_BY_KEY[key]) return false;
    if (instant) { this.current = key; this.next = null; this.progress = 1; }
    else { this.next = key; this.progress = 0; }
    this.held = 0;
    this.holdFor = this._holdLength();
    this.locked = lock;
    return true;
  }

  /** Let the clock choose again. */
  unlock() { this.locked = false; }

  update(dt) {
    if (this.next) {
      this.progress += dt / Math.max(0.001, this.transitionSeconds);
      if (this.progress >= 1) { this.current = this.next; this.next = null; this.progress = 1; }
      return;
    }
    if (this.locked) return;
    this.held += dt;
    if (this.held >= this.holdFor) {
      const pick = rollWeather(this.weights, this.rng);
      this.held = 0;
      this.holdFor = this._holdLength();
      if (pick !== this.current) { this.next = pick; this.progress = 0; }
    }
  }

  /** The numbers to render right now. */
  blend(out = {}) {
    const a = WEATHER_BY_KEY[this.current] || WEATHER_BY_KEY.clear;
    const b = this.next ? WEATHER_BY_KEY[this.next] : a;
    const t = this.next ? clamp(this.progress, 0, 1) : 0;
    for (const f of FIELDS) out[f] = lerp(a[f], b[f], t);
    out.key = t > 0.5 ? (this.next || this.current) : this.current;
    out.name = WEATHER_BY_KEY[out.key]?.name || 'Clear';
    out.changing = !!this.next;
    return out;
  }
}

// ---------------------------------------------------------------------------- palettes

const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export function hexToRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbToHex(r, g, b) { return '#' + hex2(r) + hex2(g) + hex2(b); }

/** rgb 0..255 -> hsl with h in 0..1. */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hslToHex(h, s, l) {
  h = ((h % 1) + 1) % 1; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  if (s === 0) { const v = l * 255; return rgbToHex(v, v, v); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = t => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex(channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255);
}

/** Nudge a colour's hue, saturation and lightness. */
export function shiftColor(hex, { hue = 0, sat = 0, light = 0 } = {}) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return hslToHex(h + hue, s + sat, l + light);
}

/** How wild a world's skies are allowed to get: 0 a mild blue-sky world, 1 somewhere hostile. */
export function extremityOf(body = {}) {
  const arch = body.archetype || '';
  const base = { lava: 1, toxic: 0.95, voidTouched: 0.9, crystal: 0.75, desert: 0.6, ice: 0.5, barren: 0.45, tidalLocked: 0.6, jungle: 0.35, tundra: 0.3, ocean: 0.22, living: 0.18 }[arch] ?? 0.5;
  const hazards = (body.hazards || []).length * 0.06;
  const air = Math.abs((body.atmosphere?.density ?? 0.6) - 0.9) * 0.18;
  return clamp(base + hazards + air, 0, 1);
}

/**
 * The colours of one world's air and water, varied per planet.
 *
 * Two lava worlds should not be the same lava world: the archetype sets the family, the planet's own
 * seed moves it about inside that family, and how far it may move is `extremityOf()` — a temperate
 * blue-sky world barely shifts, a toxic one can come out any colour it likes.
 *
 * Returns `{ sky, skyHorizon, sea, cloud, cloudShadow, fog, extremity }`, all `#rrggbb`.
 */
export function atmospherePalette(body = {}, { variation = 1 } = {}) {
  const rng = makeRng(subSeed((body.seed ?? 1) >>> 0, 'palette'));
  const extremity = extremityOf(body);
  const swing = extremity * variation;

  const skyBase = body.skyColor || body.sky || '#7fb4e8';
  const seaBase = body.seaColor || body.sea || '#14548a';
  const airBase = body.atmosphere?.color || '#a8d0f4';

  const jitter = (amount) => (rng() * 2 - 1) * amount;
  const sky = shiftColor(skyBase, { hue: jitter(0.14 * swing), sat: jitter(0.22 * swing), light: jitter(0.12 * swing) });
  // the horizon is always a little paler and warmer than the top of the sky
  const skyHorizon = shiftColor(sky, { hue: jitter(0.05 * swing) + 0.02, sat: -0.1 - rng() * 0.12, light: 0.1 + rng() * 0.1 });
  const sea = seaBase
    ? shiftColor(seaBase, { hue: jitter(0.16 * swing), sat: jitter(0.26 * swing), light: jitter(0.1 * swing) })
    : null;
  const cloud = shiftColor(airBase, { hue: jitter(0.1 * swing), sat: -0.25 + jitter(0.3 * swing), light: 0.18 - extremity * 0.34 + jitter(0.12 * swing) });
  const cloudShadow = shiftColor(cloud, { sat: 0.05, light: -0.24 });
  const fog = shiftColor(skyHorizon, { sat: -0.08, light: -0.05 });

  return { sky, skyHorizon, sea, cloud, cloudShadow, fog, extremity: +extremity.toFixed(3) };
}

// The dominant weather per cell is the same for the life of a world, and working it out for every
// cell is not free, so the map layer is computed once and kept with the world.
const weatherMaps = new WeakMap();

/**
 * The most likely weather over every cell, as ids into WEATHER. Cached per world.
 * The renderer turns these into colours; a game can read it as a climate map.
 */
export function weatherMap(world) {
  const cached = weatherMaps.get(world);
  if (cached) return cached;
  const N = world.width * world.height;
  const out = new Uint8Array(N);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const i = y * world.width + x;
      const key = dominantWeather(weatherWeights(cellClimate(world, x, y)));
      out[i] = Math.max(0, WEATHER_KEYS.indexOf(key));
    }
  }
  weatherMaps.set(world, out);
  return out;
}

/**
 * The weather a whole world tends toward, sampled over its land — for a planet card or a map legend.
 * Returns the odds table across the map, so "a storm world" is a thing you can read off it.
 */
export function worldWeatherProfile(world, { samples = 900 } = {}) {
  const totals = {};
  const step = Math.max(1, Math.floor(Math.sqrt((world.width * world.height) / samples)));
  let counted = 0;
  for (let y = 0; y < world.height; y += step) {
    for (let x = 0; x < world.width; x += step) {
      const odds = weatherOdds(weatherAt(world, x, y));
      for (const o of odds) totals[o.key] = (totals[o.key] || 0) + o.share;
      counted++;
    }
  }
  const out = Object.entries(totals)
    .map(([key, v]) => ({ key, name: WEATHER_BY_KEY[key].name, share: v / Math.max(1, counted) }))
    .sort((a, b) => b.share - a.share);
  return out;
}
