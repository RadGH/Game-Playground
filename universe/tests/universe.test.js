// node --test universe/tests/universe.test.js
// Checks the generator's promises: the same seed gives the same universe, every star class and every
// planet archetype turns up, living worlds stay rare, every planet is worth mining, a single-biome
// planet really is one biome, a living world really has several plus ice caps, and a save reloads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STAR_CLASSES, STAR_BY_KEY, makeStar, habitableZone, frostLine, orbitTempK, colorForTempK, starName, fallbackStarName } from '../js/stars.js';
import { generateGalaxy, GALAXY_PRESETS, LAYOUTS, nearestStar, route } from '../js/galaxy.js';
import { generateSystem, ARCHETYPES, ARCHETYPE_KEYS, ARCH_BY_KEY, planetSummary, bodies } from '../js/system.js';
import { planetWorldOpts, generatePlanetMap, hasSurfaceMap, familyShare, mapMix, clearMapCache } from '../js/planetmap.js';
import { BASELINE, RARE, rareFor } from '../js/elements.js';
import { toJSON, fromJSON, galaxyToJSON, galaxyFromJSON, systemToJSON, systemFromJSON, regenerate, jsonSizeKB } from '../js/export.js';
import { BIOME_FAMILIES, inFamily, BIOMES } from '../../worldgen/js/biomes.js';
import { NameGen } from '../../namegen/js/namegen.js';

const read = f => JSON.parse(readFileSync(new URL('../../namegen/data/' + f, import.meta.url)));
const namegen = new NameGen({ languages: read('languages.json'), concepts: read('concepts.json'), patterns: read('patterns.json') });

const MAP = { width: 96, height: 48 };

// One big sample, built once and shared: 300 systems is enough for the distribution checks.
const big = (() => {
  const galaxy = generateGalaxy({ seed: 8675309, stars: 300, layout: 'spiral' });
  const systems = galaxy.stars.map(s => generateSystem(s, { seed: s.seed }));
  const planets = systems.flatMap(s => s.planets);
  return { galaxy, systems, planets };
})();

// ---------------------------------------------------------------------------- stars

test('the star table is complete and its numbers hang together', () => {
  assert.ok(STAR_CLASSES.length >= 10, 'star classes: ' + STAR_CLASSES.length);
  const keys = new Set();
  for (const c of STAR_CLASSES) {
    assert.ok(!keys.has(c.key), 'duplicate star class ' + c.key);
    keys.add(c.key);
    assert.ok(/^#[0-9a-f]{6}$/i.test(c.color), c.key + ' has a bad colour');
    assert.ok(c.lum >= 0 && c.radius > 0 && c.mass > 0, c.key + ' has impossible numbers');
    assert.ok(c.planets[0] <= c.planets[1], c.key + ' planet range');
    assert.ok(c.blurb.length > 20, c.key + ' needs a blurb');
  }
  // hotter classes really are brighter, and the habitable zone follows brightness
  assert.ok(STAR_BY_KEY.blueGiant.lum > STAR_BY_KEY.yellow.lum);
  assert.ok(STAR_BY_KEY.yellow.lum > STAR_BY_KEY.redDwarf.lum);
  assert.ok(habitableZone(1).inner < habitableZone(100).inner);
  assert.ok(habitableZone(1).inner < habitableZone(1).outer);
  assert.ok(frostLine(1) > habitableZone(1).outer, 'the frost line must sit outside the water zone');
  // a body twice as far out is cooler
  assert.ok(orbitTempK(1, 1) > orbitTempK(1, 4));
  assert.ok(Math.abs(orbitTempK(1, 1) - 255) < 40, 'our own orbit should land near 255 K, got ' + orbitTempK(1, 1));
  assert.ok(/^#[0-9a-f]{6}$/i.test(colorForTempK(5700)));
});

test('a star is built from its seed and comes back the same', () => {
  const a = makeStar({ seed: 99, id: 1 });
  const b = makeStar({ seed: 99, id: 1 });
  assert.deepEqual(a, b);
  assert.notEqual(makeStar({ seed: 100, id: 1 }).name, a.name);
  const binary = makeStar({ seed: 5, classKey: 'binaryPair' });
  assert.ok(binary.companion, 'a binary pair needs a companion');
  assert.ok(binary.lum >= binary.companion.lum);
  const hole = makeStar({ seed: 5, classKey: 'blackHole' });
  assert.ok(hole.accretion && hole.accretion.outer > hole.accretion.inner);
  const pulsar = makeStar({ seed: 5, classKey: 'neutronStar' });
  assert.ok(pulsar.pulse > 0 && pulsar.radiation === 1);
  // names work with and without Name Forge
  assert.ok(fallbackStarName(12).length > 1);
  assert.ok(starName(12, namegen).length > 1);
  assert.equal(starName(12, namegen, 'dwarf'), starName(12, namegen, 'dwarf'));
});

test('every star class turns up in a big galaxy, and the mix sliders move the odds', () => {
  const counts = big.galaxy.stats.byClass;
  for (const c of STAR_CLASSES) assert.ok(counts[c.key] > 0, `no ${c.key} in 300 stars`);
  const exotic = generateGalaxy({ seed: 3, stars: 200, mix: { exotic: 8, cool: 0.2, hot: 0.2, dying: 0.2 } });
  const plain = generateGalaxy({ seed: 3, stars: 200, mix: { exotic: 0.01 } });
  assert.ok(exotic.stats.exotic > plain.stats.exotic * 3, `exotic mix did nothing: ${exotic.stats.exotic} vs ${plain.stats.exotic}`);
});

// ---------------------------------------------------------------------------- galaxy

test('every layout places its stars and links them all together', () => {
  for (const layout of LAYOUTS) {
    const g = generateGalaxy({ seed: 21, stars: 140, layout });
    assert.equal(g.stars.length, 140, layout);
    assert.equal(g.stats.isolated, 0, layout + ' left stars with no lane');
    for (const s of g.stars) {
      assert.ok(s.x >= -1.0001 && s.x <= 1.0001 && s.y >= -1.0001 && s.y <= 1.0001, `${layout} put a star outside the map`);
      assert.ok(s.name.length > 1);
    }
    // the whole graph is one piece: a route exists from the first star to the last
    assert.ok(route(g, 0, g.stars.length - 1).length > 0, layout + ' is not fully connected');
  }
});

test('a galaxy is rebuilt exactly from its seed, and the presets all work', () => {
  const a = generateGalaxy({ seed: 4242, stars: 120 });
  const b = generateGalaxy({ seed: 4242, stars: 120 });
  assert.deepEqual(a.stars, b.stars);
  assert.deepEqual(a.lanes, b.lanes);
  assert.notDeepEqual(generateGalaxy({ seed: 4243, stars: 120 }).stars, a.stars);
  for (const [name, preset] of Object.entries(GALAXY_PRESETS)) {
    const g = generateGalaxy({ seed: 9, stars: 120, ...preset });
    assert.ok(g.stars.length > 10, name);
    assert.equal(g.stats.isolated, 0, name + ' left a star stranded');
  }
  const near = nearestStar(a, a.stars[7].x, a.stars[7].y);
  assert.equal(near.star.id, 7);
});

// ---------------------------------------------------------------------------- systems

test('the archetype table is complete and every archetype turns up', () => {
  assert.ok(ARCHETYPES.length >= 14, 'archetypes: ' + ARCHETYPES.length);
  for (const a of ARCHETYPES) {
    assert.ok(['single', 'multi'].includes(a.biomeMode), a.key);
    if (a.biomeMode === 'single' && !a.giant) assert.ok(BIOME_FAMILIES[a.family], `${a.key} names a family that does not exist: ${a.family}`);
    assert.ok(a.tempK[0] < a.tempK[1] && a.radius[0] < a.radius[1], a.key + ' has a backwards range');
    assert.ok(a.blurb.length > 25, a.key + ' needs a blurb');
    assert.ok(/^#[0-9a-f]{6}$/i.test(a.sky), a.key + ' sky colour');
  }
  const counts = {};
  for (const p of big.planets) counts[p.archetype] = (counts[p.archetype] || 0) + 1;
  for (const k of ARCHETYPE_KEYS) assert.ok(counts[k] > 0, `no ${k} in ${big.planets.length} planets`);
});

test('living worlds stay rare (3–8% of planets)', () => {
  const living = big.planets.filter(p => p.archetype === 'living').length;
  const share = living / big.planets.length;
  assert.ok(share >= 0.03 && share <= 0.08, `living worlds are ${(share * 100).toFixed(1)}% of ${big.planets.length} planets`);
  // and every one of them is somewhere water could sit
  for (const p of big.planets.filter(x => x.archetype === 'living')) {
    assert.ok(p.temperature.K > 250 && p.temperature.K < 320, `${p.name} is a living world at ${p.temperature.K} K`);
    assert.equal(p.biomeMode, 'multi');
  }
});

test('orbits and temperatures make sense: further out is colder, giants live past the frost line', () => {
  for (const sys of big.systems.slice(0, 60)) {
    let last = 0;
    for (const p of sys.planets) {
      assert.ok(p.orbit.au > last, `${sys.name}: orbits must step outwards`);
      last = p.orbit.au;
      assert.ok(p.orbit.periodDays > 0 && p.gravity > 0 && p.radius > 0);
      assert.ok(p.temperature.K >= ARCH_BY_KEY[p.archetype].tempK[0] - 1 && p.temperature.K <= ARCH_BY_KEY[p.archetype].tempK[1] + 1,
        `${p.name} (${p.archetype}) is ${p.temperature.K} K, outside its band`);
      assert.ok(planetSummary(p).length > 30);
    }
    assert.ok(bodies(sys).length >= sys.planets.length);
  }
});

test('most giants form past the frost line, and only a few migrate inwards', () => {
  const giants = big.planets.filter(p => p.giant);
  assert.ok(giants.length > 20, 'only ' + giants.length + ' giants');
  const outer = giants.filter(p => p.orbit.au > p.star.frostLine * 0.5 || p.orbit.beyondFrost).length;
  assert.ok(outer / giants.length > 0.75, `only ${(100 * outer / giants.length).toFixed(0)}% of giants are past the frost line`);
});

test('every planet carries the baseline four and at least one rare element', () => {
  const baselineKeys = BASELINE.map(b => b.key);
  const rareSeen = new Set();
  for (const p of big.planets) {
    assert.equal(p.resources.length, baselineKeys.length, p.name + ' is missing a baseline resource');
    for (const k of baselineKeys) {
      const r = p.resources.find(x => x.key === k);
      assert.ok(r, `${p.name} has no ${k}`);
      assert.ok(r.abundance > 0 && r.abundance <= 1, `${p.name} ${k} abundance ${r.abundance}`);
    }
    assert.ok(p.rareElements.length >= 1 && p.rareElements.length <= 2, `${p.name} has ${p.rareElements.length} rare elements`);
    for (const r of p.rareElements) {
      rareSeen.add(r.key);
      assert.ok(rareFor(p.archetype).some(e => e.key === r.key), `${r.key} should not turn up on a ${p.archetype} world`);
    }
  }
  for (const e of RARE) assert.ok(rareSeen.has(e.key), `${e.key} never turned up in ${big.planets.length} planets`);
});

test('the elements file is well formed', () => {
  assert.ok(BASELINE.length === 4 && RARE.length >= 8);
  const keys = new Set();
  for (const e of [...BASELINE, ...RARE]) {
    assert.ok(!keys.has(e.key), 'duplicate element ' + e.key);
    keys.add(e.key);
    assert.ok(/^#[0-9a-f]{6}$/i.test(e.color), e.key + ' colour');
    assert.ok(e.tags.length >= 2 && e.name.length > 2 && e.blurb.length > 20, e.key);
    assert.ok(e.value > 0, e.key + ' value');
  }
  for (const e of RARE) {
    assert.ok(e.worlds.length >= 3, e.key + ' should be findable on a few kinds of world');
    for (const w of e.worlds) assert.ok(ARCHETYPE_KEYS.includes(w), `${e.key} names an archetype that does not exist: ${w}`);
  }
  // every archetype can produce something rare
  for (const k of ARCHETYPE_KEYS) assert.ok(rareFor(k).length > 0, `nothing rare can be found on a ${k} world`);
});

test('the knobs change what comes out', () => {
  const star = makeStar({ seed: 77, classKey: 'yellow' });
  const full = generateSystem(star, { seed: 77, planets: 1 });
  const sparse = generateSystem(star, { seed: 77, planets: 0 });
  assert.ok(full.planets.length > sparse.planets.length, `planets knob did nothing: ${full.planets.length} vs ${sparse.planets.length}`);

  let ringed = 0, plain = 0;
  for (let i = 0; i < 40; i++) {
    const s = makeStar({ seed: 500 + i });
    ringed += generateSystem(s, { seed: s.seed, ringChance: 1 }).stats.ringed;
    plain += generateSystem(s, { seed: s.seed, ringChance: 0 }).stats.ringed;
  }
  assert.ok(ringed > plain, `rings knob did nothing: ${ringed} vs ${plain}`);
  assert.equal(plain, 0, 'ringChance 0 should mean no rings at all');

  const calm = generateSystem(star, { seed: 77, hazardLevel: 0 });
  const nasty = generateSystem(star, { seed: 77, hazardLevel: 1 });
  assert.ok(nasty.stats.maxDifficulty > calm.stats.maxDifficulty, 'hazard knob did nothing');
});

// ---------------------------------------------------------------------------- planet maps

test('a single-biome planet gets a single-biome world', () => {
  clearMapCache();
  const checked = new Set();
  for (const p of big.planets) {
    if (p.biomeMode !== 'single' || p.giant || checked.has(p.archetype)) continue;
    checked.add(p.archetype);
    const world = generatePlanetMap(p, MAP);
    const share = familyShare(world, p.biomeFamily);
    assert.ok(share.land > 50, `${p.name} (${p.archetype}) has almost no land: ${share.land} cells`);
    assert.ok(share.share >= 0.85, `${p.name} (${p.archetype}) is only ${(share.share * 100).toFixed(0)}% ${p.biomeFamily}`);
  }
  assert.ok(checked.size >= 6, 'only checked ' + [...checked].join(', '));
});

test('a living world is many biomes with ice at the poles', () => {
  clearMapCache();
  const living = big.planets.filter(p => p.archetype === 'living').slice(0, 4);
  assert.ok(living.length >= 2, 'no living worlds to check');
  for (const p of living) {
    const world = generatePlanetMap(p, MAP);
    const mix = mapMix(world);
    assert.ok(mix.distinct >= 6, `${p.name} only uses ${mix.distinct} land biomes`);
    assert.ok(mix.ice > world.width * 2, `${p.name} has no ice caps (${mix.ice} cells)`);
    // the ice really is at the poles, not scattered over the tropics
    const h = world.height;
    let polar = 0, tropic = 0;
    for (let y = 0; y < h; y++) {
      const lat = Math.abs((y + 0.5) / h * 2 - 1);
      for (let x = 0; x < world.width; x++) {
        const b = world.biome[y * world.width + x];
        if (b !== 12 && b !== 25) continue;
        if (lat > 0.7) polar++; else if (lat < 0.35) tropic++;
      }
    }
    assert.ok(polar > tropic * 3, `${p.name}: ${polar} polar ice cells vs ${tropic} tropical ones`);
    assert.ok(world.stats.landFraction > 0.12 && world.stats.landFraction < 0.75, `${p.name} land fraction ${world.stats.landFraction}`);
  }
});

test('map knobs follow the planet, and a gas giant has no map at all', () => {
  const giant = big.planets.find(p => p.giant);
  assert.ok(giant, 'no giant to check');
  assert.equal(hasSurfaceMap(giant), false);
  assert.equal(generatePlanetMap(giant, MAP), null);

  const ice = big.planets.find(p => p.archetype === 'ice');
  const lava = big.planets.find(p => p.archetype === 'lava');
  assert.equal(planetWorldOpts(ice).biomeLock, 'ice');
  assert.ok(planetWorldOpts(ice).temperature < 0.25, 'an ice world should be generated cold');
  assert.equal(planetWorldOpts(lava).palette, 'lava');
  assert.ok(planetWorldOpts(lava).temperature > 0.8, 'a lava world should be generated hot');
  // the same planet always gives the same knobs
  assert.deepEqual(planetWorldOpts(ice), planetWorldOpts(ice));

  // every locked family is a real one, and the locked biomes exist
  for (const a of ARCHETYPES) {
    if (!a.family) continue;
    for (const key of BIOME_FAMILIES[a.family].members) assert.ok(BIOMES.some(b => b.key === key), `${a.family} names a biome that does not exist: ${key}`);
  }
});

test('a tidally locked world is hot on one face and frozen on the other', () => {
  clearMapCache();
  const locked = big.planets.find(p => p.archetype === 'tidalLocked' || (p.tidalLocked && !p.giant));
  assert.ok(locked, 'no tidally locked planet to check');
  const world = generatePlanetMap(locked, MAP);
  const w = world.width, h = world.height;
  let day = 0, night = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = world.temperature[y * w + x];
    if (x > w * 0.42 && x < w * 0.58) { day += t; n++; } else if (x < w * 0.06 || x > w * 0.94) night += t;
  }
  assert.ok(day / n > 0.3, 'the lit face should be warm, got ' + (day / n).toFixed(2));
  assert.ok(night / (h * w * 0.12) < day / n, 'the dark face should be colder than the lit one');
});

test('the same planet always gives the same map, and the cache hands back the same object', () => {
  clearMapCache();
  const p = big.planets.find(x => !x.giant);
  const a = generatePlanetMap(p, MAP);
  const b = generatePlanetMap(p, MAP);
  assert.equal(a, b, 'the cache should return the same world');
  const c = generatePlanetMap(p, { ...MAP, force: true });
  assert.deepEqual(Array.from(c.biome), Array.from(a.biome));
  assert.ok(c.regions.length > 0 && c.regions.every(r => r.name.length > 1));
});

// ---------------------------------------------------------------------------- saving

test('a universe saves and reloads unchanged', () => {
  const galaxy = generateGalaxy({ seed: 555, stars: 80 });
  const star = galaxy.stars[9];
  const system = generateSystem(star, { seed: star.seed });
  const planet = system.planets[0] || null;

  const save = JSON.parse(JSON.stringify(toJSON({ galaxy, system, planet })));
  const back = fromJSON(save);
  assert.deepEqual(back.galaxy.stars, galaxy.stars);
  assert.deepEqual(back.system.planets, system.planets);
  assert.deepEqual(back.planet, planet);
  assert.ok(jsonSizeKB(save) > 0);

  // knobs only: the galaxy comes back from the seed
  const small = galaxyToJSON(galaxy, { stars: false });
  assert.equal(small.stars, null);
  assert.deepEqual(galaxyFromJSON(small).stars, galaxy.stars);

  assert.deepEqual(systemFromJSON(JSON.parse(JSON.stringify(systemToJSON(system)))).planets, system.planets);

  // and the whole thing rebuilds from nothing but the knobs
  const again = regenerate({ galaxyOpts: { seed: 555, stars: 80 }, starId: 9, planetId: 0 });
  assert.deepEqual(again.system.planets, system.planets);
});

test('a planet map survives the trip through a save', () => {
  clearMapCache();
  const r = regenerate({ galaxyOpts: { seed: 31, stars: 40 }, starId: 3, planetId: 0 });
  if (!r.planet || r.planet.giant) return;                    // nothing to map in this system
  const before = generatePlanetMap(r.planet, MAP);
  const planet = JSON.parse(JSON.stringify(r.planet));
  clearMapCache();
  const after = generatePlanetMap(planet, MAP);
  assert.deepEqual(Array.from(after.biome), Array.from(before.biome));
});
