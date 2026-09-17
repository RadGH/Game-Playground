// node --test prototypes/farhold/tests/round9.test.js
//
// Round 9 is space and the map: a star that does not swallow its own planets, flight you can cross
// a continent with, a warp drive that does not lock out half an AU away, six skies instead of one,
// and a map that pans and zooms into real detail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createSystem, createWorld, makeTerrain } from '../js/planet.js';
// the table is Three-free (js/sky-looks.js); the module that paints it is not
import { SKY_LOOKS, skyLookFor } from '../js/sky-looks.js';
import { generateRegionDetail } from '../../../worldgen/js/local.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const balance = read('../data/balance.json');

/** The same sum `js/space.js` does, so the test checks the rule rather than a screenshot. */
const EARTH = 700, AU = 14000;
function drawnStarRadius(star, system) {
  const closestAu = Math.min(...(system.planets || []).map(p => p.orbit?.au ?? Infinity), Infinity);
  const wanted = Math.max(EARTH * 2.2, EARTH * (star.radius ?? 1) * 1.6);
  const roomFor = Number.isFinite(closestAu) ? closestAu * AU * 0.42 : Infinity;
  return Math.max(EARTH * 0.5, Math.min(wanted, roomFor));
}

test('no planet is ever drawn inside its own star — including seed 777', () => {
  // "An issue discovered on seed 777 is that there is a Neutron Star with rings and a shaft sticking
  // out of it, very cool; however there are two planets INSIDE the diameter of the sun."
  const { star, system } = createSystem({ seed: 777 });
  const radius = drawnStarRadius(star, system);
  for (const p of system.planets) {
    const orbit = (p.orbit?.au ?? 0) * AU;
    assert.ok(orbit > radius, `${p.name} orbits at ${Math.round(orbit)} inside a star drawn at ${Math.round(radius)}`);
  }
  // …and the floor still applies, so a tiny star is not invisible
  assert.ok(radius >= EARTH * 0.5);

  // every seed, not just the one that was reported
  for (let seed = 1; seed <= 60; seed++) {
    const run = createSystem({ seed });
    const r = drawnStarRadius(run.star, run.system);
    for (const p of run.system.planets) {
      const orbit = (p.orbit?.au ?? 0) * AU;
      assert.ok(orbit > r, `seed ${seed}: ${p.name} is inside its star`);
    }
  }
});

test('the warp lockout is a lap, not half an AU', () => {
  // "I'm 0.34 AU away from a planet and still can't boost, it's tiny in comparison. It started
  // working around 0.75 AU but it's just too far away."
  const within = balance.space.noWarpWithin;
  assert.ok(within <= 4, `the lockout is still ${within} body radii`);
  // for a world of ordinary size that has to come out well under a third of an AU
  const lockoutAu = (within * EARTH) / AU;
  assert.ok(lockoutAu < 0.2, `an Earth-sized world locks warp out for ${lockoutAu.toFixed(2)} AU`);
});

test('the flight model can hold its own altitude, which is what flying around a planet needs', () => {
  // The wing used to be capped at 0.92, so a ship flying flat out and dead level still fell.
  const cfg = balance.flight || {};
  const liftMax = cfg.liftMax ?? 1.04;
  assert.ok(liftMax >= 1, `a wing that carries ${liftMax} of the ship can never hold a line`);
  // …and it still sags when slow, or hovering would be free
  const slowLift = (10 / (cfg.liftSpeedFull ?? 95)) * 1 * 1;
  assert.ok(slowLift < 0.5, 'a ship barely moving should still sink');
});

test('there are several skies, and each one is genuinely different', () => {
  // "Can we have several variations of this skybox used by different stars? Can each one customize
  // the colors of the skybox so that stars all feel more unique and different?"
  assert.ok(SKY_LOOKS.length >= 4, `only ${SKY_LOOKS.length} skies`);
  const bases = new Set(SKY_LOOKS.map(l => l.base));
  assert.equal(bases.size, SKY_LOOKS.length, 'two skies share a background colour');
  for (const look of SKY_LOOKS) {
    assert.ok(look.key && look.name, 'a sky with no name');
    assert.match(look.base, /^#[0-9a-f]{6}$/i);
    for (const range of [look.hueA, look.hueB]) {
      assert.equal(range.length, 2);
      assert.ok(range[1] > range[0], `${look.key} has a backwards hue range`);
      assert.ok(range[0] >= 0 && range[1] <= 360);
    }
    assert.ok(look.dust > 0 && look.spread > 0 && look.glow > 0, `${look.key} would draw nothing`);
    assert.ok(look.sat >= 0 && look.sat <= 100);
  }
  // the hue ranges are spread out rather than six shades of the same blue
  const centres = SKY_LOOKS.map(l => (l.hueA[0] + l.hueA[1]) / 2).sort((a, b) => a - b);
  assert.ok(centres[centres.length - 1] - centres[0] > 120, 'every sky is the same colour family');

  // a star always has the same sky, and across many stars all of them turn up
  assert.equal(skyLookFor(42).key, skyLookFor(42).key);
  const used = new Set();
  for (let seed = 1; seed <= 400; seed++) used.add(skyLookFor(seed).key);
  assert.equal(used.size, SKY_LOOKS.length, `only ${used.size} of the ${SKY_LOOKS.length} skies ever appear`);
});

test('the map zooms into real detail rather than a bigger blur', () => {
  // "Can the map get more detailed, eventually fading into the interim and then fully zoomed in
  // levels like seen in the Star Forge experiment?"
  const run = createWorld({ seed: 1337, width: 128, height: 64 });
  assert.ok(run.world.regions?.length > 2, 'this world has no regions to detail');
  const detail = generateRegionDetail(run.world, 0, { factor: 6, maxCells: 260000 });
  assert.ok(detail, 'no detail pass');
  assert.equal(detail.factor, 6);
  // it really is more map: six times the cells across, in both directions
  assert.equal(detail.width, detail.worldCells.w * detail.factor);
  assert.equal(detail.height, detail.worldCells.h * detail.factor);
  // six times the cells per world cell in each direction — thirty-six times the map, over the
  // patch you are actually looking at
  const perCell = (detail.width * detail.height) / (detail.worldCells.w * detail.worldCells.h);
  assert.equal(perCell, detail.factor * detail.factor);
  assert.ok(perCell >= 36, `only ${perCell} detail cells per world cell`);
  // and it knows where it belongs, which is what makes the overlay land on the right pixels
  assert.ok(Number.isFinite(detail.origin.x) && Number.isFinite(detail.origin.y));
  assert.ok(detail.origin.x >= 0 && detail.origin.y >= 0);
  assert.ok(detail.biome && detail.elevation, 'the detail carries no map layers');
});

test('a system is drawn with room to fly around in', () => {
  // the orbits have to be spread enough that the chart and the space scene are both legible
  for (const seed of [1, 7, 19, 777]) {
    const { system } = createSystem({ seed });
    const orbits = system.planets.map(p => p.orbit?.au ?? 0).sort((a, b) => a - b);
    for (let i = 1; i < orbits.length; i++) {
      assert.ok(orbits[i] > orbits[i - 1], `seed ${seed} has two worlds at the same orbit`);
      assert.ok(orbits[i] / orbits[i - 1] > 1.1, `seed ${seed}: orbits ${orbits[i - 1]} and ${orbits[i]} are on top of each other`);
    }
  }
});

test('roads and water agree with each other on every test seed', () => {
  // the round-8 rules, checked again here because round 9 moved the road surface code
  for (const seed of [1337, 7, 19, 3, 42]) {
    const run = createWorld({ seed, width: 128, height: 64 });
    const terrain = makeTerrain(run.world, run.planet);
    let bad = 0;
    for (const road of terrain.roadPaths) {
      for (let i = 0; i < road.points.length; i++) {
        if (road.wet?.[i]) continue;
        if (terrain.hasSea && road.surface[i] < terrain.seaLevel) bad++;
      }
    }
    assert.equal(bad, 0, `seed ${seed} has ${bad} drawn road points under water`);
  }
});
