// node --test prototypes/farhold/tests/round23-graphics.test.js
//
// ROUND 23 — the graphics round.
//
//   "Take a look at the game '3d high def' where we've implemented better graphics including bloom
//    and gpu grass. What of these effects can we use to enhance the graphics of the game? It's OK the
//    characters are cartoony but I would rather the world feel more atmospheric with multi-colored
//    sunsets and more atmospheric weather and enhanced rain and wind effects."
//
// Most of what this round built is shader code, which a node test cannot run. What it CAN check is
// the part that decides what the shaders are told, because that part was written to be pure:
//
//   js/sky-palette.js  the sky table — is a sunset really several colours, is a night really not black,
//                      does an alien world keep its own colours, does orbit really have no fog
//   js/wind.js         ONE wind — turn the knob and ask every consumer which way it now blows
//   js/gfx.js          the Graphics setting — does Off really turn the passes off
//   js/grass-plan.js   where the GPU grass grows, and the lattice property that stops it crawling
//
// and, by reading the source, that the consumers really do go through those modules rather than
// keeping a private copy of the rule (this project's signature fault is a finished module nobody
// calls, and its second is a number with two owners).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { skyState, sampleTable, fogFor, gradeFor, paletteShift, toHsl, hueGap, hex, SKY_TABLE } from '../js/sky-palette.js';
import { createWind, rainVelocity, snowDrift, debrisVelocity, cloudDrift, swayUniforms } from '../js/wind.js';
import { resolveGraphics, GRAPHICS_LEVELS, DEFAULT_GRAPHICS } from '../js/gfx.js';
import { grassAt, grassDensityFor, snapOrigin, slotCell, hashCell } from '../js/grass-plan.js';
import { DEFAULTS } from '../js/settings.js';

const src = f => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hue = c => toHsl(c)[0];
const sat = c => toHsl(c)[1];

// ------------------------------------------------------------------ the sky table

test('a sunset is layered: at least four different hues up the sun side of the sky', () => {
  for (const y of [-0.03, 0, 0.03]) {
    const s = skyState(y, {});
    const bands = ['zenith', 'upper', 'mid', 'low', 'horizon'].map(k => s[k]);
    // count the bands whose hue is at least 18 degrees from every band already counted
    const kept = [];
    for (const b of bands) if (kept.every(k => Math.abs(hueGap(hue(k), hue(b))) >= 18)) kept.push(b);
    assert.ok(kept.length >= 4, `sun at ${y}: only ${kept.length} distinct hues in ${bands.map(b => Math.round(hue(b))).join(', ')}`);
    // deep blue overhead, warm at the horizon
    assert.ok(Math.abs(hueGap(hue(s.zenith), 225)) < 30, `zenith hue ${hue(s.zenith)} is not a blue`);
    assert.ok(Math.abs(hueGap(hue(s.horizon), 30)) < 30, `horizon hue ${hue(s.horizon)} is not gold/orange`);
    // and the sun side burns while the far side is the planet's own blue shadow
    assert.ok(lum(s.horizon) > lum(s.aHorizon) * 1.4, 'the horizon under the sun should be brighter than the one opposite');
  }
});

test('the rose band arrives after the gold and leaves after it — they do not move together', () => {
  // the low (rose) band is still warm when the sun is already a little below the horizon
  const under = sampleTable(-0.05);
  assert.ok(under.low[0] > under.low[2], 'the low band should still be warm just after sunset');
  // and it is already blue again by mid-morning
  const morning = sampleTable(0.35);
  assert.ok(morning.low[2] > morning.low[0], 'by mid-morning the low band is sky-blue');
});

test('a night is not flat black: a moonlit blue sky, a blue light and a fill that still lights the ground', () => {
  const s = skyState(-0.6, {});
  assert.ok(lum(s.zenith) > 0.015, 'the night zenith is pure black');
  assert.ok(s.zenith[2] > s.zenith[0] && s.horizon[2] > s.horizon[0], 'the night sky is not blue');
  assert.ok(s.sun[2] > s.sun[0], 'moonlight should be cool');
  assert.ok(s.sunI > 0.1 && s.ambI > 0.3, `the night light is too weak (${s.sunI}, ${s.ambI})`);
  assert.ok(s.stars > 0.9, 'the stars should be out');
  // and the camera opens up for it
  assert.ok(gradeFor(s).exposure > gradeFor(skyState(0.9, {})).exposure);
});

test('noon: deep blue overhead, pale at the horizon, bright light', () => {
  const s = skyState(0.95, {});
  assert.ok(lum(s.horizon) > lum(s.zenith) + 0.15, 'the horizon should be paler than the zenith');
  assert.ok(s.sunI > 1.8);
  assert.ok(s.dusk < 0.02);
});

test('an alien world keeps its own sky — and gets its own sunset, not an Earth one', () => {
  const earth = skyState(0.02, {});
  const toxic = { sky: '#b8c040', skyHorizon: '#e0d890', cloudShadow: '#6a6a40' };
  const alien = skyState(0.02, toxic);
  const alienNoon = skyState(0.9, toxic);
  // noon leans on the palette's own colour
  assert.ok(Math.abs(hueGap(hue(alienNoon.mid), hue(hex(toxic.sky)))) < 25, 'the alien noon sky lost its colour');
  // the sunset bands have been turned round the colour wheel
  const turned = ['zenith', 'upper', 'mid', 'low'].filter(k => Math.abs(hueGap(hue(alien[k]), hue(earth[k]))) > 15);
  assert.ok(turned.length >= 3, `only ${turned.length} sunset bands changed colour on the alien world`);
  // and a blue-sky palette barely moves anything
  assert.ok(Math.abs(paletteShift({ sky: '#7fb4e8' }).hue) < 1);
});

test('bad weather washes the colour out; lightning floods it; climbing out of the air drains it to black', () => {
  const clear = skyState(0.5, {});
  const storm = skyState(0.5, {}, { gloom: 0.7 });
  assert.ok(sat(storm.upper) < sat(clear.upper), 'a storm sky should be greyer');
  assert.ok(storm.sunI < clear.sunI * 0.7, 'a storm should steal the sunlight');
  const flash = skyState(0.5, {}, { gloom: 0.7, flash: 1 });
  assert.ok(lum(flash.zenith) > lum(storm.zenith) + 0.2, 'lightning should light the sky');
  const orbit = skyState(0.5, {}, { space: 1 });
  assert.ok(lum(orbit.zenith) < 0.02 && lum(orbit.upper) < 0.02, 'orbit should have a black sky');
  assert.ok(lum(orbit.horizon) > lum(orbit.zenith), 'a thin limb of air stays at the horizon on the way out');
  assert.equal(orbit.stars, 1);
});

test('the table is ordered and every row has every band', () => {
  for (let i = 1; i < SKY_TABLE.length; i++) assert.ok(SKY_TABLE[i].y > SKY_TABLE[i - 1].y);
  for (const row of SKY_TABLE) {
    for (const k of ['zenith', 'upper', 'mid', 'low', 'horizon', 'aUpper', 'aMid', 'aLow', 'aHorizon', 'glow', 'sun', 'hemiSky', 'hemiGround', 'fog']) {
      assert.match(row[k], /^#[0-9a-f]{6}$/i, `${k} at ${row.y}`);
    }
  }
});

// ------------------------------------------------------------------ height fog

test('height fog: a morning mist in the valleys, thicker in the rain, none indoors and none in orbit', () => {
  const noon = fogFor(0.9, {}, { rising: true });
  const dawn = fogFor(0.03, {}, { rising: true });
  const dusk = fogFor(0.03, {}, { rising: false });
  assert.ok(dawn.density > noon.density * 2, 'dawn should be misty');
  assert.ok(dawn.falloff > noon.falloff, 'the morning mist should lie LOW (thin out faster with height)');
  assert.ok(dusk.density < dawn.density, 'an evening is clearer than a morning');
  const rain = fogFor(0.9, { rain: 0.8, gloom: 0.5 });
  assert.ok(rain.density > noon.density * 3, 'rain should thicken the air');
  assert.ok(rain.falloff < noon.falloff, 'rain fills the whole column, not just the ground');
  assert.ok(rain.inscatter < noon.inscatter, 'there is no sun glow through a storm');
  const fogWeather = fogFor(0.9, { fog: 0.9 });
  assert.ok(fogWeather.density > rain.density);
  assert.equal(fogFor(0.9, {}, { space: 1 }).amount, 0, 'orbit must not have a fog wall');
  assert.ok(fogFor(0.9, {}, { space: 0.5 }).amount < 1, 'the fog fades on the way up');
  assert.equal(fogFor(0.9, { rain: 1 }, { indoors: true }).amount, 0);
});

test('the fog shader integrates height fog in closed form and glows toward the sun', () => {
  const a = src('atmosphere.js');
  assert.match(a, /\( fhE0 - fhE1 \) \/ fhDy/, 'the closed-form column integral is missing');
  assert.match(a, /dot\( fhDir, uFhSunDir \)/, 'no sun in-scatter');
  // exponents are clamped — a camera 40 km up would otherwise overflow a float
  assert.match(a, /clamp\( fhB \* \( cameraPosition\.y - uFhFogBase \), -20\.0, 60\.0 \)/);
  // and the chunk is installed on import, before any material compiles
  assert.match(a, /^installAtmosphere\(\);$/m);
});

// ------------------------------------------------------------------ one wind

test('ONE wind: turn it round and every consumer blows the new way', () => {
  const wind = createWind({ seed: 5 });
  wind.set({ angle: 0, strength: 0.8 });
  wind.update(0.016, 0.8);
  const east = {
    rain: rainVelocity(wind, 30), snow: snowDrift(wind), debris: debrisVelocity(wind),
    cloud: cloudDrift(wind), sway: swayUniforms(wind),
  };
  assert.ok(east.rain.x > 3 && Math.abs(east.rain.z) < 1e-9, 'the rain does not lean east');
  assert.ok(east.snow.x > 1 && Math.abs(east.snow.z) < 1e-9);
  assert.ok(east.debris.x > 5 && Math.abs(east.debris.z) < 1e-9);
  assert.ok(east.cloud.u > 0 && Math.abs(east.cloud.v) < 1e-12);
  assert.ok(Math.abs(east.sway.dirX - 1) < 1e-9 && east.sway.amount > 0.7);

  wind.set({ angle: Math.PI / 2 });
  wind.update(0.016, 0.8);
  const south = {
    rain: rainVelocity(wind, 30), snow: snowDrift(wind), debris: debrisVelocity(wind),
    cloud: cloudDrift(wind), sway: swayUniforms(wind),
  };
  assert.ok(Math.abs(south.rain.x) < 1e-6 && south.rain.z > 3, 'the rain did not follow the wind round');
  assert.ok(Math.abs(south.snow.x) < 1e-6 && south.snow.z > 1);
  assert.ok(Math.abs(south.debris.x) < 1e-6 && south.debris.z > 5);
  assert.ok(Math.abs(south.cloud.u) < 1e-9 && south.cloud.v > 0);
  assert.ok(Math.abs(south.sway.dirZ - 1) < 1e-9);

  // and a calm is calm everywhere at once
  wind.set({ strength: 0 });
  wind.update(0.016, 0);
  assert.ok(Math.abs(rainVelocity(wind).z) < 0.01, 'rain still slanting in a calm');
  assert.ok(swayUniforms(wind).amount < 0.2, 'trees still leaning in a calm');
});

test('the wind drifts on its own, follows the weather, and two worlds do not blow the same way', () => {
  const a = createWind({ seed: 1 }), b = createWind({ seed: 2 });
  assert.notEqual(a.angle.toFixed(3), b.angle.toFixed(3));
  const a0 = a.angle;
  for (let i = 0; i < 600; i++) a.update(1, 0.9);
  assert.ok(Math.abs(a.angle - a0) > 0.01, 'the wind never changes direction');
  assert.ok(a.strength > 0.85, 'the wind never caught up with the weather');
  for (let i = 0; i < 5; i++) a.update(0.1, 0);
  assert.ok(a.strength > 0.3, 'a storm should die down over seconds, not snap off');
});

test('every consumer really reads the shared wind — none keeps a private rule', () => {
  const weather = src('weather.js'), rain = src('rain.js'), atmo = src('atmosphere.js');
  const grass = src('grass-gpu.js'), props = src('props.js'), graphics = src('graphics.js');
  const main = src('main.js');
  // the old rules, gone
  assert.doesNotMatch(weather, /const slant = wind \* 10/, 'the old +x-only rain slant is back');
  assert.doesNotMatch(weather, /pos\[i \* 3\] \+= \(7 \+ wind \* 26\)/, 'the old +x-only dust is back');
  // the new ones, used
  assert.match(weather, /import \{[^}]*rainVelocity[^}]*snowDrift[^}]*debrisVelocity[^}]*cloudDrift[^}]*\} from '\.\/wind\.js'/);
  assert.match(weather, /cloudDrift\(wind\)/);
  assert.match(rain, /rainVelocity\(wind/);
  assert.match(rain, /snowDrift\(wind\)/);
  assert.match(rain, /debrisVelocity\(wind\)/);
  assert.match(atmo, /swayUniforms\(wind\)/);
  assert.match(grass, /uFhWindDir/, 'the GPU grass does not read the shared wind uniform');
  assert.match(props, /markSway\(material/, 'the scatter does not sway');
  // one wind object for the whole game, handed to the weather view on BOTH of its construction sites
  assert.equal((graphics.match(/createWind\(/g) || []).length, 1);
  assert.equal((main.match(/createWeatherView\(\{[^}]*\.\.\.graphics\.weatherOpts\(\)/g) || []).length, 2,
    'a weather view built without the shared wind would blow its own way');
});

// ------------------------------------------------------------------ the Graphics setting

test('the Graphics setting: Off really turns the pipeline off, and ?quality=low forces Off', () => {
  assert.deepEqual(GRAPHICS_LEVELS, ['off', 'low', 'high']);
  assert.equal(DEFAULT_GRAPHICS, 'high');
  assert.equal(DEFAULTS.graphics, 'high');
  const off = resolveGraphics('off');
  for (const k of ['postfx', 'bloom', 'shafts', 'grade', 'gpuGrass', 'rainSheets']) assert.equal(off[k], false, `off still has ${k}`);
  assert.equal(off.rainDrops, 0);
  assert.equal(off.msaa, 0);
  const low = resolveGraphics('low');
  assert.ok(low.postfx && low.bloom && low.grade);
  assert.equal(low.shafts, false);
  assert.equal(low.gpuGrass, false);
  assert.ok(low.bloomScale < 1);
  const high = resolveGraphics('high');
  for (const k of ['postfx', 'bloom', 'shafts', 'grade', 'gpuGrass']) assert.equal(high[k], true, `high is missing ${k}`);
  assert.ok(high.rainDrops > low.rainDrops && high.debris > low.debris);
  assert.equal(resolveGraphics('high', { lowQuality: true }).level, 'off', '?quality=low must mean Off');
  assert.equal(resolveGraphics('off', { lowQuality: true, override: 'high' }).level, 'high', '?graphics= wins');
  assert.equal(resolveGraphics('nonsense').level, 'high');
  // the always-on pieces cost instructions, not draws, so even Off has them
  assert.ok(off.heightFog && off.sway && off.wetGround);
});

test('the setting is on the panel, and the pipeline obeys it', () => {
  const settings = src('settings.js');
  assert.match(settings, /key: 'graphics', label: 'Graphics effects', kind: 'choice', options: \[\['off', 'Off'\], \['low', 'Low'\], \['high', 'High'\]\]/);
  const post = src('postfx.js');
  // Off draws straight to the screen with no target and no passes
  assert.match(post, /if \(!flags\.postfx \|\| !sceneRT\) \{ renderer\.setRenderTarget\(null\); draw\(\); return; \}/);
  assert.match(post, /if \(!flags\.postfx\) \{ sceneRT = midRT = null; return; \}/);
  // bloom before tone mapping: the bloom pass reads the HDR target, and ACES is in the final pass
  assert.ok(post.indexOf('bloom.render(renderer, null, src') < post.indexOf('final.render(renderer)'));
  assert.match(post, /vec3 col = toSRGB\( aces\( hdr \) \);/);
  const main = src('main.js');
  assert.match(main, /if \(!key \|\| key === 'graphics'\) graphics\.setLevel\(v\.graphics\);/);
  assert.match(main, /graphics\.render\(mode, \(\) => \{/);
});

// ------------------------------------------------------------------ the GPU grass

test('grass grows on grass: none on sand, ice, ash, rock, water, roads or town squares', () => {
  for (const k of ['desert', 'beach', 'ice', 'snowyPeaks', 'volcanic', 'ashPlain', 'badlands', 'ocean', 'lake']) {
    assert.equal(grassDensityFor(k), 0, `${k} grows grass`);
  }
  assert.ok(grassDensityFor('grassland') > 0.7);
  const field = { biomeKey: 'grassland', plantable: true, road: 0, cleared: false, town: 0 };
  assert.ok(grassAt(field) > 0.7);
  assert.equal(grassAt({ ...field, plantable: false }), 0, 'grass under water');
  assert.equal(grassAt({ ...field, road: 0.8 }), 0, 'grass on the road');
  assert.ok(grassAt({ ...field, road: 0.35 }) < grassAt(field), 'the road shoulder should thin the grass');
  assert.equal(grassAt({ ...field, cleared: true }), 0, 'grass on a levelled plot');
  assert.equal(grassAt({ ...field, town: 1 }), 0, 'a lawn in the town square');
});

test('the lattice: a blade belongs to its square of ground, whichever slot draws it', () => {
  // two patch origins a few squares apart; every square both of them cover gets the same blade
  const cell = 0.3;
  const offsets = [];
  for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) offsets.push([i, j]);
  const bladeAt = (origin) => {
    const m = new Map();
    for (const o of offsets) {
      const c = slotCell(origin, o);
      m.set(c.join(','), hashCell(c[0], c[1], 0));
    }
    return m;
  };
  // 30 km from the origin, where float precision is what breaks a naive version
  const a = snapOrigin(30000.0, 18000.0, cell);
  const b = snapOrigin(30000.0 + 1.1, 18000.0 - 0.7, cell);
  assert.ok(Number.isInteger(a[0]) && Number.isInteger(b[1]), 'the origin must be a whole square');
  const A = bladeAt(a), B = bladeAt(b);
  let shared = 0;
  for (const [k, v] of A) if (B.has(k)) { shared++; assert.deepEqual(B.get(k), v, `square ${k} grew a different blade`); }
  assert.ok(shared > 60);
  // a sub-square step does not move the origin at all (the field cannot creep)
  assert.deepEqual(snapOrigin(30000.0 + 0.1, 18000.0, cell), a);
  // and the hash is still a hash that far out
  let sum = 0, n = 0;
  for (let i = 0; i < 400; i++) { const h = hashCell(100000 + i, 60000 + i * 3, 1); for (const v of h) { assert.ok(v >= 0 && v < 1); sum += v; n++; } }
  assert.ok(Math.abs(sum / n - 0.5) < 0.05, 'the hash is badly skewed at large coordinates');
});

test('the GPU grass stands on the DRAWN triangles, and the CPU tufts step aside for it', () => {
  const g = src('grass-gpu.js');
  // the height comes from ring 0's own array, re-uploaded when the ring rebuilds
  assert.match(g, /r\._heights/);
  assert.match(g, /r\.version/);
  assert.match(src('terrain.js'), /this\.version = \(this\.version \|\| 0\) \+ 1;/);
  // interpolated along the ring's own diagonal (quad a,b,c,d split b-c: u + v <= 1 is a-b-c)
  assert.match(g, /f\.x \+ f\.y <= 1\.0/);
  // integer lattice and integer hash
  assert.match(g, /ivec2 fhCellId = ivec2\( uOriginCell \+ aOffset \);/);
  assert.match(g, /uvec4 v = uvec4\(/);
  // one grass at a time
  const props = src('props.js');
  assert.match(props, /grassVisible && grassMode === 'cpu'/);
  assert.match(src('graphics.js'), /props\.setGrassMode\(want, ctx\.x, ctx\.z\)/);
});
