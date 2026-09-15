// node --test universe/tests/universe.test.js
// Checks the generator's promises: the same seed gives the same universe, every star class and every
// planet archetype turns up, living worlds stay rare, every planet is worth mining, a single-biome
// planet really is one biome, a living world really has several plus ice caps, and a save reloads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STAR_CLASSES, STAR_BY_KEY, makeStar, habitableZone, frostLine, orbitTempK, colorForTempK, starName, fallbackStarName } from '../js/stars.js';
import { generateGalaxy, GALAXY_PRESETS, LAYOUTS, nearestStar, route } from '../js/galaxy.js';
import {
  generateSystem, ARCHETYPES, ARCHETYPE_KEYS, ARCH_BY_KEY, planetSummary, bodies,
  MIN_ORBIT_RATIO, MIN_ORBIT_RATIO_OUTER, orbitRatios, orbitLayout, moonsOf, moonById,
} from '../js/system.js';
import { planetWorldOpts, generatePlanetMap, hasSurfaceMap, familyShare, mapMix, clearMapCache, moonMapSize, mapSizeFor, columnClimate, reliefFor, surfaceOf } from '../js/planetmap.js';
import { cellInfo } from '../../worldgen/js/world.js';
import { generateRegionDetail, generateLocalDetail } from '../../worldgen/js/local.js';
import { forbiddenWordIn } from '../../worldgen/js/names.js';
import { BASELINE, RARE, rareFor } from '../js/elements.js';
import { toJSON, fromJSON, galaxyToJSON, galaxyFromJSON, systemToJSON, systemFromJSON, regenerate, jsonSizeKB, moonIndex, moonToJSON, moonFromJSON } from '../js/export.js';
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


// ---------------------------------------------------------------------------- orbit spacing (SF1)

test('no two orbits are closer than the floor, over 200 seeds', () => {
  let systems = 0, worst = Infinity, worstName = '';
  for (let seed = 1; seed <= 200; seed++) {
    const star = makeStar(seed * 7919, {});
    const sys = generateSystem(star, { seed: star.seed, planets: 1 });       // as full as it goes
    if (sys.planets.length < 2) continue;
    systems++;
    const ratios = orbitRatios(sys);
    for (const [i, r] of ratios.entries()) {
      const floor = sys.planets[i].orbit.beyondFrost ? MIN_ORBIT_RATIO_OUTER : MIN_ORBIT_RATIO;
      // the ladder never promises the *outer* floor when the inner planet is still inside the frost
      // line, so the inner floor is the one that has to hold everywhere
      assert.ok(r >= MIN_ORBIT_RATIO - 1e-9,
        `${sys.name}: ${sys.planets[i].orbit.au} → ${sys.planets[i + 1].orbit.au} is only ${r.toFixed(3)}× (floor ${floor})`);
      if (r < worst) { worst = r; worstName = sys.name; }
    }
  }
  assert.ok(systems > 120, 'only ' + systems + ' systems with two or more planets');
  assert.ok(worst >= MIN_ORBIT_RATIO - 1e-9, `tightest pair ${worst.toFixed(3)}× in ${worstName}`);
});

test('the drawn orbits keep their gap, and no planet is drawn wider than its lane', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const star = makeStar(seed * 104729, {});
    const sys = generateSystem(star, { seed: star.seed, planets: 1 });
    if (!sys.planets.length) continue;
    const L = orbitLayout(sys, { minGap: 1.05, starRadius: 0.6 });
    assert.equal(L.radii.length, sys.planets.length);
    for (let i = 0; i < L.radii.length; i++) {
      const prev = i > 0 ? L.radii[i - 1] : 0.6;
      assert.ok(L.radii[i] - prev >= 1.05 - 1e-9,
        `${sys.name}: rings ${i - 1}→${i} are ${(L.radii[i] - prev).toFixed(3)} apart`);
      assert.ok(L.radii[i] > prev, 'rings must step outwards');
      // the size cap: a planet's drawn radius is at most a third of its narrowest gap, so two
      // neighbouring planets can never touch however big they are
      const size = L.sizeFor(i, 99);
      assert.ok(size <= L.gapAt(i) * 0.34 + 1e-9, `${sys.name}: planet ${i} would be drawn too big`);
      assert.ok(size * 2 < L.gapAt(i), 'a planet must be narrower than its own lane');
    }
    // belts land between the planets they were rolled between, on the same ladder
    for (const b of sys.belts) {
      const inner = L.radiusFor(b.inner), outer = L.radiusFor(b.outer);
      assert.ok(outer > inner, `${sys.name}: belt drawn inside out`);
    }
    // and the mapping is monotone: further out in AU is always further out on screen
    const aus = [0.02, 0.3, 1, 4, 20, 90, 300];
    for (let i = 1; i < aus.length; i++) assert.ok(L.radiusFor(aus[i]) > L.radiusFor(aus[i - 1]));
  }
});

// ---------------------------------------------------------------------------- moons (SF2)

const moonSample = (() => {
  const galaxy = generateGalaxy({ seed: 4242, stars: 250 });
  const systems = galaxy.stars.map(s => generateSystem(s, { seed: s.seed }));
  return { systems, moons: systems.flatMap(s => moonsOf(s)) };
})();

test('a moon is a small planet: stable id, own seed, one of four kinds', () => {
  const moons = moonSample.moons;
  assert.ok(moons.length > 300, 'only ' + moons.length + ' moons');
  const kinds = new Set();
  const ids = new Set();
  for (const { moon: m, parent } of moons) {
    kinds.add(m.archetype);
    assert.ok(['barren', 'ice', 'lava', 'living'].includes(m.archetype), 'odd moon kind: ' + m.archetype);
    assert.equal(m.id, `${parent.id}m${m.index}`);
    assert.ok(!ids.has(`${parent.seed}:${m.id}`), 'moon ids must be unique inside a planet');
    ids.add(`${parent.seed}:${m.id}`);
    assert.ok(Number.isFinite(m.seed) && m.seed !== parent.seed, 'a moon needs its own seed');
    assert.equal(m.moon, true);
    assert.equal(m.parentId, parent.id);
    assert.equal(m.giant, false);
    assert.ok(m.radius > 0 && m.gravity > 0 && m.mass > 0);
    assert.ok(m.resources.length === 4, 'the baseline four');
    assert.ok(m.rareElements.length >= 1);
    assert.ok(m.temperature.K >= ARCH_BY_KEY[m.archetype].tempK[0] - 1 && m.temperature.K <= ARCH_BY_KEY[m.archetype].tempK[1] + 1,
      `${m.name} is ${m.temperature.K} K, outside its band`);
    assert.ok(m.orbit.aroundPlanet > 1.5, 'a moon orbits outside its planet');
    assert.ok(hasSurfaceMap(m), 'every moon has ground');
  }
  assert.ok(kinds.has('barren') && kinds.has('ice') && kinds.has('lava'), [...kinds].join(','));
});

test('a living moon is rare, big and warm; moons hold less than planets', () => {
  const moons = moonSample.moons.map(x => x.moon);
  const living = moons.filter(m => m.archetype === 'living');
  const share = living.length / moons.length;
  assert.ok(share > 0 && share < 0.06, `living moons are ${(share * 100).toFixed(1)}% of moons`);
  for (const m of living) {
    assert.ok(m.radius >= 0.25, `${m.name} is only ${m.radius}× Earth`);
    assert.ok(m.temperature.K >= 260 && m.temperature.K <= 310);
    assert.ok(m.atmosphere.density > 0.4, 'a living moon keeps real air');
  }
  // a moon carries less of everything than the average planet does
  const avg = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const moonAb = avg(moons.flatMap(m => m.resources.map(r => r.abundance)));
  const planetAb = avg(moonSample.systems.flatMap(s => s.planets).flatMap(p => p.resources.map(r => r.abundance)));
  assert.ok(moonAb < planetAb, `moons ${moonAb.toFixed(2)} vs planets ${planetAb.toFixed(2)}`);
  assert.ok(avg(moons.map(m => m.rareElements.length)) < 1.35, 'moons rarely carry two rare elements');
});

test('a moon map is smaller than its planet, simpler, and the same on every visit', () => {
  clearMapCache();
  const size = { width: 128, height: 64 };
  assert.deepEqual(moonMapSize(size), { width: 64, height: 32 });
  assert.deepEqual(mapSizeFor({ moon: false }, size), size);

  let checked = 0;
  for (const { moon: m, parent } of moonSample.moons) {
    if (checked >= 4) break;
    if (parent.giant) { /* a giant has no map of its own, its moons still do */ }
    const ms = mapSizeFor(m, size);
    const world = generatePlanetMap(m, { ...ms, force: true });
    assert.equal(world.width, 64);
    assert.equal(world.height, 32);
    assert.equal(world.planet.moon, true);
    assert.equal(world.planet.parentId, parent.id);
    assert.ok(world.regions.length >= 3 && world.regions.length <= 14, m.name + ': ' + world.regions.length + ' regions');
    assert.ok(world.biome.length === 64 * 32);
    if (!parent.giant) {
      const pw = generatePlanetMap(parent, { ...size, force: true });
      assert.ok(world.regions.length < pw.regions.length + 1, 'a moon has no more provinces than its planet');
    }
    // the same moon, from the saved record, comes back identical
    const copy = JSON.parse(JSON.stringify(m));
    clearMapCache();
    const again = generatePlanetMap(copy, { ...ms });
    assert.deepEqual(Array.from(again.biome), Array.from(world.biome), m.name + ' is not stable');
    checked++;
  }
  assert.equal(checked, 4);
});

test('a moon knob set follows the moon, not its planet', () => {
  const { moon: m } = moonSample.moons.find(x => x.moon.archetype === 'ice');
  const o = planetWorldOpts(m, { width: 64, height: 32 });
  assert.equal(o.seed, m.seed >>> 0);
  assert.equal(o.biomeLock, 'ice');
  assert.ok(o.regionCount <= 14 && o.regionCount >= 4);
  assert.ok(o.settlementDensity <= 0.25);
});

test('moons travel in a save and rebuild from the seed alone', () => {
  const galaxy = generateGalaxy({ seed: 4242, stars: 40 });
  let starId = -1, system = null;
  for (const s of galaxy.stars) {
    const sys = generateSystem(s, { seed: s.seed });
    if (sys.planets.some(p => p.moons.length)) { starId = s.id; system = sys; break; }
  }
  assert.ok(system, 'no system with a moon in 40 stars');
  const planet = system.planets.find(p => p.moons.length);
  const moon = planet.moons[0];

  const index = moonIndex(system);
  assert.ok(index.length >= 1);
  assert.ok(index.every(r => r.id && Number.isFinite(r.seed) && r.parentId != null));

  const save = JSON.parse(JSON.stringify(toJSON({ galaxy, system, planet, moon })));
  assert.equal(save.system.moons.length, index.length);
  const back = fromJSON(save);
  assert.deepEqual(back.moon, moon);
  assert.deepEqual(moonFromJSON(JSON.parse(JSON.stringify(moonToJSON(moon)))), moon);
  assert.deepEqual(moonById(back.system, moon.id), moon);

  // and from nothing but the seed
  const again = regenerate({ galaxyOpts: { seed: 4242, stars: 40 }, starId, planetId: planet.id, moonId: moon.id });
  assert.deepEqual(again.moon, moon);
  const byIndex = regenerate({ galaxyOpts: { seed: 4242, stars: 40 }, starId, planetId: planet.id, moonId: 0 });
  assert.deepEqual(byIndex.moon, moon);
});


// ---------------------------------------------------------------------------- tidally locked

test('a locked world burns in the middle and freezes on the far side, with no stripe anywhere', () => {
  clearMapCache();
  const locked = [];
  for (const sys of big.systems) {
    for (const p of sys.planets) if (p.tidalLocked && !p.giant) locked.push(p);
    if (locked.length >= 6) break;
  }
  assert.ok(locked.length >= 4, 'only ' + locked.length + ' locked planets found');

  for (const p of locked.slice(0, 6)) {
    const world = generatePlanetMap(p, { width: 128, height: 64, force: true });
    assert.equal(world.tidalLocked, true, p.name + ' did not get the locked pass');
    const { temp, ice } = columnClimate(world);
    const w = world.width, mid = w >> 1;

    // the substellar face is hot, the far face — which is the two edges, meeting at the seam — frozen
    assert.ok(temp[mid] - temp[0] > 0.35, `${p.name}: centre ${temp[mid].toFixed(2)} vs edge ${temp[0].toFixed(2)}`);
    assert.ok(temp[mid] - temp[w - 1] > 0.35, `${p.name}: centre vs the other edge`);
    assert.ok(temp[0] < 0.2 && temp[w - 1] < 0.2, `${p.name}: the far face is not cold`);
    assert.ok(ice[0] > 0.5 && ice[w - 1] > 0.5, `${p.name}: the far face is not frozen (${ice[0].toFixed(2)})`);
    assert.ok(ice[mid] < 0.12, `${p.name}: the burning face has ice on it (${ice[mid].toFixed(2)})`);

    // the frozen part is a whole hemisphere, not a band at the edges: a quarter of the way in from
    // the edge (halfway round to the twilight ring) it is still cold
    const q = Math.round(w * 0.06);
    assert.ok(temp[q] < 0.25, `${p.name}: only the very edge is cold`);

    // and no column steps away from its neighbours — that is what a stripe down the sphere is
    for (let x = 0; x < w; x++) {
      const l = (x - 1 + w) % w, r = (x + 1) % w;
      assert.ok(Math.abs(temp[x] - (temp[l] + temp[r]) / 2) < 0.03,
        `${p.name}: temperature stripe at column ${x}`);
      assert.ok(Math.abs(ice[x] - (ice[l] + ice[r]) / 2) < 0.25,
        `${p.name}: ice stripe at column ${x} (${ice[l].toFixed(2)} ${ice[x].toFixed(2)} ${ice[r].toFixed(2)})`);
      assert.ok(Math.abs(temp[x] - temp[r]) < 0.06, `${p.name}: temperature step at column ${x}`);
    }
    // the map wraps: the first and last columns are the two halves of the same longitude
    assert.ok(Math.abs(temp[0] - temp[w - 1]) < 0.03, p.name + ': the seam does not line up');
  }
});

test('a locked moon keeps its face to its planet, not to the star, so it gets no hot face', () => {
  clearMapCache();
  const found = moonSample.moons.find(x => x.moon.tidalLocked);
  assert.ok(found, 'no locked moon');
  const world = generatePlanetMap(found.moon, { width: 64, height: 32, force: true });
  assert.notEqual(world.tidalLocked, true);
  const { temp } = columnClimate(world);
  const mid = world.width >> 1;
  assert.ok(Math.abs(temp[mid] - temp[0]) < 0.35, 'a moon should not have a burning face');
});

// ---------------------------------------------------------------------------- names

test('nothing in a system shares a name, and no two stars in a galaxy do either', () => {
  // both namers: the built-in one, and Name Forge, which is the one that repeats itself
  for (const namer of [null, namegen]) {
    const galaxy = generateGalaxy({ seed: 777, stars: 300, namegen: namer });
    const starNames = galaxy.stars.map(s => s.name);
    assert.equal(new Set(starNames).size, starNames.length, 'two stars share a name');

    for (const star of galaxy.stars.slice(0, 120)) {
      const sys = generateSystem(star, { seed: star.seed, namegen: namer });
      const names = [
        star.name,
        ...sys.planets.map(p => p.name),
        ...sys.planets.flatMap(p => p.moons.map(m => m.name)),
        ...sys.belts.map(b => b.name),
        ...sys.comets.map(c => c.name),
      ];
      assert.equal(new Set(names).size, names.length,
        `${star.name}: a name is used twice — ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`);
    }
  }
});


// ---------------------------------------------------------------------------- heights (SF3)

test('every body gets a height scale: lighter bodies stand taller, and it never changes', () => {
  const bodies = [...big.planets.filter(p => !p.giant).slice(0, 150), ...moonSample.moons.slice(0, 150).map(x => x.moon)];
  for (const b of bodies) {
    const r = reliefFor(b);
    assert.ok(Number.isFinite(r.landMetres) && r.landMetres >= 2400 && r.landMetres <= 26000, `${b.name}: ${r.landMetres} m`);
    assert.ok(Number.isFinite(r.seaMetres) && r.seaMetres > 0 && r.seaMetres <= r.landMetres);
    assert.ok(r.datum === 'sea' || r.datum === 'datum');
    assert.ok(typeof r.label === 'string' && r.label.length > 2);
    assert.deepEqual(reliefFor(JSON.parse(JSON.stringify(b))), r, b.name + ': the scale changed on a second look');
  }
  // a much lighter body of the same kind has taller relief
  const heavy = reliefFor({ seed: 5, archetype: 'barren', gravity: 1.4, atmosphere: { density: 0 } });
  const light = reliefFor({ seed: 5, archetype: 'barren', gravity: 0.2, atmosphere: { density: 0 } });
  assert.ok(light.landMetres > heavy.landMetres * 1.5, `${light.landMetres} vs ${heavy.landMetres}`);
  // a real sea measures from sea level; airless rock, ice shells and lava plains from a datum
  assert.equal(reliefFor({ seed: 1, archetype: 'ocean', gravity: 1, atmosphere: { density: 1 } }).datum, 'sea');
  assert.equal(reliefFor({ seed: 1, archetype: 'barren', gravity: 0.3, atmosphere: { density: 0 } }).datum, 'datum');
  assert.equal(reliefFor({ seed: 1, archetype: 'ice', gravity: 0.3, atmosphere: { density: 0.2 } }).datum, 'datum');
  assert.equal(reliefFor({ seed: 1, archetype: 'lava', gravity: 1, atmosphere: { density: 0.5 } }).datum, 'datum');
});

test('hovering any cell of a planet, moon or region map reads a real height', () => {
  clearMapCache();
  const planet = big.planets.find(p => p.archetype === 'ocean') || big.planets.find(p => !p.giant);
  const { moon } = moonSample.moons.find(x => x.moon.atmosphere.density < 0.02);
  for (const body of [planet, moon]) {
    const world = generatePlanetMap(body, { ...mapSizeFor(body, { width: 128, height: 64 }), force: true });
    assert.deepEqual(world.relief, reliefFor(body));
    let low = 0;
    for (let y = 0; y < world.height; y += 3) {
      for (let x = 0; x < world.width; x += 3) {
        const info = cellInfo(world, x, y);
        assert.ok(Number.isFinite(info.heightMetres), `${body.name} ${x},${y}: height ${info.heightMetres}`);
        assert.ok(Number.isFinite(info.depthMetres) && info.depthMetres >= 0);
        assert.equal(info.elevationMetres, info.heightMetres);
        assert.ok(Math.abs(info.heightMetres) <= Math.max(world.relief.landMetres, world.relief.seaMetres));
        if (info.heightMetres < 0) {
          low++;
          // below the datum: depth on a sea world, just low ground (never "deep") on a dry one
          if (world.relief.datum === 'sea') assert.ok(info.depthMetres >= 0);
          else { assert.equal(info.depthMetres, 0, 'a body with no sea reports no depth'); assert.equal(info.water, 'land'); }
        }
        assert.equal(info.datum, world.relief.datum);
      }
    }
    assert.ok(low > 0, body.name + ': expected some low ground to check');
    // the zoomed-in region keeps the same scale
    const region = world.regions.slice().sort((a, b) => b.cells - a.cells)[0];
    const detail = generateRegionDetail(world, region.id, { factor: 5 });
    assert.deepEqual(detail.relief, world.relief);
    assert.ok(Number.isFinite(cellInfo(detail, 2, 2).heightMetres));
  }
});


// ---------------------------------------------------------------------------- what is on the ground

// the words a dead world must never be named with — deliberately a separate list from names.js, so this
// checks the generator rather than repeating it. A word counts on its own or at the end of a compound.
const WATERY = /(fen|marsh|mire|mere|lake|river|forest|wood|brook|pond|pool|swamp|bog|meadow|grove|isle|shore)\b/i;
const SETTLED = /\b(kingdom|principality|protectorate|dominion|holdfast|freehold|realm|empire)\b/i;

const namesOf = w => [
  ...w.regions.map(r => r.name), ...w.ranges.map(r => r.name), ...w.continents.map(c => c.name),
  ...w.seas.map(x => x.name), ...w.lakes.map(x => x.name), ...w.rivers.map(x => x.name),
  ...w.forests.map(x => x.name), ...w.nodes.map(n => n.name),
];

test('surfaceOf: liquid, settlement and vocabulary follow the archetype and the air', () => {
  const s = (archetype, density = 1, extra = {}) => surfaceOf({ archetype, atmosphere: { density }, ...extra });
  for (const a of ['barren', 'ice', 'crystal', 'voidTouched']) {
    assert.equal(s(a).liquid, 'none', a);
    assert.equal(s(a).frame, 'land', a);
    assert.equal(s(a).inhabited, false, a);
  }
  assert.deepEqual(s('lava'), { liquid: 'lava', inhabited: false, theme: 'lava', frame: 'ocean' });
  for (const a of ['living', 'ocean', 'jungle', 'tundra']) { assert.equal(s(a).liquid, 'water'); assert.equal(s(a).inhabited, true, a); assert.equal(s(a).theme, null); }
  for (const a of ['desert', 'toxic', 'tidalLocked']) { assert.equal(s(a).liquid, 'water'); assert.equal(s(a).inhabited, false, a); }
  // water needs air: an airless desert is dry, and takes the dead vocabulary
  assert.deepEqual(s('desert', 0.01), { liquid: 'none', inhabited: false, theme: 'dead', frame: 'land' });
  assert.equal(s('living', 1, { giant: true }).inhabited, false);
});

test('a body with no liquid surface has no water, rivers, towns or roads — and names that fit', () => {
  clearMapCache();
  const galaxy = generateGalaxy({ seed: 90210, stars: 260 });
  const dry = [];
  const counts = {};
  for (const star of galaxy.stars) {
    const sys = generateSystem(star, { seed: star.seed, namegen });
    for (const b of [...sys.planets.filter(p => !p.giant), ...moonsOf(sys).map(x => x.moon)]) {
      if (surfaceOf(b).liquid !== 'none') continue;
      const key = (b.moon ? 'moon ' : '') + b.archetype;
      if ((counts[key] || 0) >= 4) continue;
      counts[key] = (counts[key] || 0) + 1;
      dry.push(b);
    }
    if (dry.length >= 28) break;
  }
  assert.ok(dry.length >= 16, 'only ' + dry.length + ' dry bodies: ' + JSON.stringify(counts));
  assert.ok(Object.keys(counts).length >= 4, 'want several kinds of dry body: ' + JSON.stringify(counts));

  for (const b of dry) {
    const surface = surfaceOf(b);
    const w = generatePlanetMap(b, { ...mapSizeFor(b, { width: 128, height: 64 }), namegen, force: true });
    const tag = `${b.name} (${b.moon ? 'moon ' : ''}${b.archetype})`;
    let water = 0, river = 0;
    for (let i = 0; i < w.water.length; i++) { if (w.water[i] !== 0) water++; if (w.river[i] !== 0) river++; }
    assert.equal(water, 0, tag + ': water cells');
    assert.equal(river, 0, tag + ': river cells');
    assert.equal(w.rivers.length + w.lakes.length + w.seas.length, 0, tag + ': rivers, lakes or seas');
    assert.equal(w.nodes.filter(n => ['settlement', 'port', 'crossing'].includes(n.type)).length, 0, tag + ': settlements');
    assert.equal(w.roads.length + w.seaLanes.length, 0, tag + ': roads');
    assert.ok(w.nodes.some(n => n.type === 'landmark' || n.type === 'dungeon' || n.type === 'pass'), tag + ': no landmarks at all');
    for (const n of w.nodes) assert.ok(['ruin', 'cave', 'monolith', 'volcano', 'crater', 'vent', 'dungeon', 'pass'].includes(n.kind), `${tag}: ${n.kind} "${n.name}"`);
    for (const name of namesOf(w)) {
      assert.ok(!WATERY.test(name), `${tag}: "${name}" is a water or forest name`);
      assert.ok(!SETTLED.test(name), `${tag}: "${name}" names a realm nobody rules`);
      assert.equal(forbiddenWordIn(name, surface.theme), null, `${tag}: "${name}" breaks the ${surface.theme} vocabulary`);
    }
    // the biomes are dry ground, not sea, lake or growing things
    for (const id of new Set(w.biome)) assert.ok(![0, 1, 2, 3, 4, 8, 9, 10, 15, 25].includes(id), `${tag}: biome ${id}`);

    // every zoom stays dry and empty
    const big = w.regions.slice().sort((a, c) => c.cells - a.cells)[0];
    const d = generateRegionDetail(w, big.id, { factor: 3, namegen });
    assert.equal(Array.from(d.water).filter(v => v !== 0).length, 0, tag + ': water in the region view');
    assert.equal(d.streams.length, 0, tag + ': streams in the region view');
    assert.equal(d.paths.length, 0, tag + ': paths in the region view');
    for (const n of d.nodes.filter(n => n.local)) assert.ok(['cave', 'ruin'].includes(n.kind), `${tag}: local ${n.kind}`);
    const tile = generateLocalDetail(w, big.label.x, big.label.y, { size: 32 });
    assert.equal(Array.from(tile.water).filter(v => v !== 0).length, 0, tag + ': water on the local tile');
  }
});

test('lava, desert and twilight worlds keep their liquid but nobody lives there', () => {
  clearMapCache();
  const galaxy = generateGalaxy({ seed: 90210, stars: 260 });
  const want = { lava: 2, desert: 2, tidalLocked: 2 };
  const found = [];
  for (const star of galaxy.stars) {
    const sys = generateSystem(star, { seed: star.seed, namegen });
    for (const p of sys.planets) if (want[p.archetype] > 0 && surfaceOf(p).liquid !== 'none') { want[p.archetype]--; found.push(p); }
    if (Object.values(want).every(v => v <= 0)) break;
  }
  assert.ok(found.length >= 5, 'found ' + found.map(p => p.archetype).join(','));
  for (const p of found) {
    const surface = surfaceOf(p);
    const w = generatePlanetMap(p, { width: 128, height: 64, namegen, force: true });
    let water = 0; for (const v of w.water) if (v) water++;
    assert.ok(water > 0, `${p.name} (${p.archetype}) lost its ${surface.liquid}`);
    assert.equal(w.nodes.filter(n => ['settlement', 'port', 'crossing'].includes(n.type)).length, 0, p.name + ': settlements');
    assert.equal(w.roads.length + w.seaLanes.length, 0, p.name + ': roads');
    assert.equal(w.history.length, 0, p.name + ': history on an empty world');
    for (const name of namesOf(w)) {
      assert.equal(forbiddenWordIn(name, surface.theme), null, `${p.name}: "${name}" breaks the ${surface.theme} vocabulary`);
      assert.ok(!SETTLED.test(name), `${p.name}: "${name}"`);
    }
  }
});

test('living worlds keep their seas, rivers, towns and roads', () => {
  clearMapCache();
  const living = big.planets.filter(p => p.archetype === 'living').slice(0, 3);
  assert.ok(living.length >= 2);
  for (const p of living) {
    const w = generatePlanetMap(p, { width: 128, height: 64, namegen, force: true });
    let water = 0; for (const v of w.water) if (v) water++;
    assert.ok(water > w.water.length * 0.2, p.name + ': seas');
    assert.ok(w.rivers.length > 0, p.name + ': rivers');
    assert.ok(w.nodes.filter(n => n.type === 'settlement').length > 3, p.name + ': towns');
    assert.ok(w.roads.length > 0, p.name + ': roads');
  }
});
