// node --test worldgen/tests/weather.test.js
// Weather has to follow the climate it came from: no snow in a desert, no rain on a world with no
// liquid, no sandstorm in the sea, and a clock that walks between states instead of teleporting.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WEATHER, WEATHER_BY_KEY, WEATHER_KEYS, weatherWeights, rollWeather, weatherOdds, dominantWeather,
  WeatherClock, atmospherePalette, extremityOf, shiftColor, rgbToHsl, hexToRgb, hslToHex,
  weatherAt, worldWeatherProfile,
} from '../js/weather.js';
import { generateWorld } from '../js/world.js';
import { BY_KEY } from '../js/biomes.js';
import { makeRng } from '../js/noise.js';

const HEX = /^#[0-9a-f]{6}$/;

test('every weather state is complete and in range', () => {
  assert.ok(WEATHER.length >= 12, `${WEATHER.length} states`);
  assert.equal(new Set(WEATHER_KEYS).size, WEATHER.length, 'a key is duplicated');
  for (const w of WEATHER) {
    assert.ok(w.name && w.name.length > 1, `${w.key} has no name`);
    for (const f of ['cloud', 'rain', 'snow', 'dust', 'fog', 'wind', 'lightning', 'gloom']) {
      assert.ok(typeof w[f] === 'number' && w[f] >= 0 && w[f] <= 1, `${w.key}.${f} = ${w[f]}`);
    }
    assert.ok(!(w.rain > 0 && w.snow > 0), `${w.key} is both rain and snow`);
  }
});

test('a hot desert gets dust and never snow; a cold peak gets snow and never sand', () => {
  const desert = weatherWeights({ temperature: 0.92, moisture: 0.08, elevation: 0.56, biome: BY_KEY.desert.id });
  assert.ok((desert.sandstorm || 0) > 0, 'a desert never blows sand');
  assert.ok(!desert.snow, 'it snowed in the desert');
  assert.ok(!desert.blizzard);

  const peak = weatherWeights({ temperature: 0.06, moisture: 0.62, elevation: 0.95, biome: BY_KEY.snowyPeaks.id });
  assert.ok((peak.snow || 0) > 0, 'no snow on a freezing peak');
  assert.ok((peak.blizzard || 0) > 0);
  assert.ok(!peak.sandstorm, 'a sandstorm on a snowy peak');
  assert.ok(!peak.rain || peak.rain < peak.snow, 'more rain than snow below freezing');
});

test('a storm needs heat and water, so a cold wet place gets rain instead', () => {
  const tropics = weatherWeights({ temperature: 0.88, moisture: 0.9, elevation: 0.55, biome: BY_KEY.rainforest.id });
  const cold = weatherWeights({ temperature: 0.24, moisture: 0.9, elevation: 0.55, biome: BY_KEY.borealForest.id });
  assert.ok((tropics.storm || 0) > (cold.storm || 0) * 3, 'storms are not tied to heat');
  assert.ok((tropics.rain || 0) > 0);
});

test('a world with no liquid has no rain, snow or drizzle at all', () => {
  const dry = weatherWeights({ temperature: 0.5, moisture: 0.8, elevation: 0.7, liquid: 'none', biome: BY_KEY.badlands.id });
  for (const key of ['rain', 'drizzle', 'storm', 'snow', 'blizzard']) {
    assert.ok(!dry[key], `a world with no liquid produced ${key}`);
  }
  assert.ok(Object.keys(dry).length > 0, 'a dry world has no weather at all');
  assert.ok((dry.clear || 0) > 0);
});

test('volcanic ground throws ash, and charged ground throws ion storms', () => {
  const volcano = weatherWeights({ temperature: 0.8, moisture: 0.3, elevation: 0.8, biome: BY_KEY.volcanic.id, volcanic: 1 });
  assert.ok((volcano.ashfall || 0) > 0 && (volcano.emberstorm || 0) > 0);

  const lava = weatherWeights({ temperature: 0.9, moisture: 0.1, archetype: 'lava', liquid: 'lava', elevation: 0.7 });
  assert.ok((lava.ashfall || 0) > 0, 'a lava world with no ash');

  const magic = weatherWeights({ temperature: 0.5, moisture: 0.5, elevation: 0.6, magic: 0.9, biome: BY_KEY.glimmerwaste.id });
  assert.ok((magic.ionstorm || 0) > 0, 'raw magic with no ion storm');

  const ordinary = weatherWeights({ temperature: 0.5, moisture: 0.5, elevation: 0.6, biome: BY_KEY.grassland.id });
  assert.ok(!ordinary.ashfall && !ordinary.ionstorm, 'a grassland is throwing ash');
});

test('marshes are foggy and hilltops are not', () => {
  const marsh = weatherWeights({ temperature: 0.5, moisture: 0.9, elevation: 0.52, biome: BY_KEY.marsh.id });
  const hill = weatherWeights({ temperature: 0.5, moisture: 0.9, elevation: 0.95, biome: BY_KEY.mountains.id });
  assert.ok(marsh.fog > hill.fog * 2, `marsh ${marsh.fog} vs hill ${hill.fog}`);
});

test('the odds add up and the dominant state is the top of the list', () => {
  const w = weatherWeights({ temperature: 0.6, moisture: 0.7, elevation: 0.6, biome: BY_KEY.temperateForest.id });
  const odds = weatherOdds(w);
  const total = odds.reduce((s, o) => s + o.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `odds total ${total}`);
  assert.equal(dominantWeather(w), odds[0].key);
  for (const o of odds) assert.ok(WEATHER_BY_KEY[o.key], `${o.key} is not a real state`);
});

test('rolling is repeatable and only ever returns a real state', () => {
  const w = weatherWeights({ temperature: 0.6, moisture: 0.7, elevation: 0.6, biome: BY_KEY.grassland.id });
  const a = Array.from({ length: 40 }, (_, i) => rollWeather(w, makeRng(i)));
  const b = Array.from({ length: 40 }, (_, i) => rollWeather(w, makeRng(i)));
  assert.deepEqual(a, b, 'the same seed rolled different weather');
  for (const key of a) assert.ok(WEATHER_BY_KEY[key], `rolled ${key}`);
  assert.equal(rollWeather({}, makeRng(1)), 'clear', 'an empty table must fall back to clear');
});

test('the clock crossfades instead of teleporting, and can be locked', () => {
  const weights = { clear: 1, storm: 1 };
  const clock = new WeatherClock({ weights, seed: 3, minMinutes: 0.01, maxMinutes: 0.02, transitionSeconds: 10 });
  const first = clock.current;
  assert.ok(WEATHER_BY_KEY[first]);

  // blended output always has every field a renderer reads
  const blend = clock.blend();
  for (const f of ['cloud', 'rain', 'snow', 'dust', 'fog', 'wind', 'lightning', 'gloom']) {
    assert.ok(typeof blend[f] === 'number' && blend[f] >= 0 && blend[f] <= 1, `${f} = ${blend[f]}`);
  }
  assert.ok(blend.name);

  // force a change and watch it arrive gradually
  clock.set('storm');
  if (first !== 'storm') {
    const seen = [];
    for (let i = 0; i < 12; i++) { clock.update(1); seen.push(clock.blend().cloud); }
    assert.ok(seen.some(v => v > 0 && v < 1), `cloud jumped straight to its target: ${seen.join(',')}`);
    assert.equal(clock.current, 'storm');
  }

  // locked, it never rolls anything else
  clock.set('fog', { lock: true, instant: true });
  for (let i = 0; i < 400; i++) clock.update(1);
  assert.equal(clock.current, 'fog', 'a locked clock changed on its own');
  clock.unlock();
  assert.equal(clock.set('nonsense'), false, 'accepted a state that does not exist');
});

test('a palette is real colours, repeatable, and wilder on a hostile world', () => {
  const mild = { seed: 5, archetype: 'living', skyColor: '#7fb4e8', seaColor: '#14548a', atmosphere: { density: 1, color: '#a8d0f4' } };
  const harsh = { seed: 5, archetype: 'lava', skyColor: '#3a1208', seaColor: '#ff5a18', atmosphere: { density: 0.8, color: '#d4762e' }, hazards: ['heat', 'ash'] };

  for (const body of [mild, harsh]) {
    const p = atmospherePalette(body);
    for (const key of ['sky', 'skyHorizon', 'cloud', 'cloudShadow', 'fog']) {
      assert.match(p[key], HEX, `${body.archetype}.${key} = ${p[key]}`);
    }
    assert.match(p.sea, HEX);
    assert.deepEqual(atmospherePalette(body), p, 'the same body gave two different palettes');
  }
  assert.ok(extremityOf(harsh) > extremityOf(mild), 'a lava world is not wilder than a living one');

  // the same archetype with different seeds must actually differ
  const a = atmospherePalette({ seed: 1, archetype: 'toxic', skyColor: '#8a7a2e', seaColor: '#4a5c1c', atmosphere: { density: 2, color: '#c2b45a' } });
  const b = atmospherePalette({ seed: 2, archetype: 'toxic', skyColor: '#8a7a2e', seaColor: '#4a5c1c', atmosphere: { density: 2, color: '#c2b45a' } });
  assert.notEqual(a.sky, b.sky, 'two toxic worlds got identical skies');
  assert.notEqual(a.sea, b.sea);

  // a mild world stays recognisably itself
  const living1 = atmospherePalette({ seed: 11, archetype: 'living', skyColor: '#7fb4e8', atmosphere: { density: 1, color: '#a8d0f4' } });
  const [h0] = rgbToHsl(...hexToRgb('#7fb4e8'));
  const [h1] = rgbToHsl(...hexToRgb(living1.sky));
  const drift = Math.min(Math.abs(h1 - h0), 1 - Math.abs(h1 - h0));
  assert.ok(drift < 0.08, `a living world's sky drifted ${drift.toFixed(3)} in hue`);
});

test('the colour helpers round-trip', () => {
  for (const hex of ['#7fb4e8', '#000000', '#ffffff', '#ff5a18', '#123456']) {
    const [h, s, l] = rgbToHsl(...hexToRgb(hex));
    const back = hslToHex(h, s, l);
    const [r1, g1, b1] = hexToRgb(hex), [r2, g2, b2] = hexToRgb(back);
    assert.ok(Math.abs(r1 - r2) <= 1 && Math.abs(g1 - g2) <= 1 && Math.abs(b1 - b2) <= 1, `${hex} -> ${back}`);
  }
  assert.match(shiftColor('#7fb4e8', { hue: 0.4, sat: 0.2, light: -0.1 }), HEX);
  assert.equal(shiftColor('#7fb4e8', {}), '#7fb4e8');
});

test('a real world reports weather everywhere, and its profile matches its climate', () => {
  const world = generateWorld({ seed: 4, width: 96, height: 48, history: false });
  for (let y = 0; y < world.height; y += 7) {
    for (let x = 0; x < world.width; x += 7) {
      const w = weatherAt(world, x, y);
      assert.ok(Object.keys(w).length > 0, `cell ${x},${y} has no possible weather`);
      const key = dominantWeather(w);
      assert.ok(WEATHER_BY_KEY[key], `cell ${x},${y} -> ${key}`);
    }
  }
  const profile = worldWeatherProfile(world, { samples: 400 });
  assert.ok(profile.length > 2, 'a whole world with fewer than three kinds of weather');
  const total = profile.reduce((s, p) => s + p.share, 0);
  assert.ok(Math.abs(total - 1) < 0.02, `profile shares total ${total}`);

  // an ice world should be dominated by cold weather
  const ice = generateWorld({ seed: 4, width: 96, height: 48, history: false, biomeLock: 'ice', temperature: 0.03 });
  const iceProfile = worldWeatherProfile(ice, { samples: 400 }).slice(0, 4).map(p => p.key);
  assert.ok(!iceProfile.includes('sandstorm'), `an ice world is having sandstorms: ${iceProfile.join(',')}`);
});
