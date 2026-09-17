// node --test prototypes/farhold/tests/planet.test.js
// The ground has to be repeatable, finite and consistent with the map it came from: the same seed
// must always give the same hill, no sample may come back NaN, and the terrain the player collides
// with must be the terrain the renderer draws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, makeTerrain, createSystem, chooseLanding, describePlanet, isHabitableStart, M_PER_CELL } from '../js/planet.js';
import { elevationToMetres } from '../../../worldgen/js/relief.js';
import { isWater } from '../../../worldgen/js/biomes.js';

const run = createWorld({ seed: 7, width: 128, height: 64 });
const terrain = makeTerrain(run.world, run.planet);

test('a seed gives a star, a system and a landable planet with a surface map', () => {
  assert.ok(run.star.name, 'the star is named');
  assert.ok(run.system.planets.length >= 1);
  assert.equal(run.planet.giant, false, 'we never land on a gas giant');
  assert.notEqual(run.planet.landable, false);
  assert.equal(run.world.width, 128);
  assert.equal(run.world.height, 64);
  assert.ok(run.world.relief.landMetres > 0, 'the map carries a height scale');
});

test('the planet is the size the scale says it is', () => {
  assert.equal(M_PER_CELL, 640);
  assert.equal(terrain.widthM, 127 * 640);
  assert.equal(terrain.depthM, 63 * 640);
  assert.ok(terrain.widthM > 50_000, 'tens of kilometres across, not metres');
});

test('every height is a finite number, and heights stay inside the relief scale', () => {
  const ceiling = run.world.relief.landMetres + 400;   // the map's own maximum, plus the detail noise
  const floor = -run.world.relief.seaMetres - 400;
  for (let i = 0; i < 3000; i++) {
    const x = (i * 97.37) % terrain.widthM, z = (i * 313.7) % terrain.depthM;
    const h = terrain.heightAt(x, z);
    assert.ok(Number.isFinite(h), `height at ${x},${z} is ${h}`);
    assert.ok(h < ceiling && h > floor, `height ${h} at ${x},${z} is outside the relief scale`);
  }
});

test('the same seed always grows the same hill', () => {
  const again = makeTerrain(createWorld({ seed: 7, width: 128, height: 64 }).world, run.planet);
  for (const [x, z] of [[1234.5, 5678.5], [0, 0], [40_000, 20_000]]) {
    assert.equal(again.heightAt(x, z), terrain.heightAt(x, z), `point ${x},${z} moved between runs`);
  }
});

test('a different seed gives a different world', () => {
  const other = createWorld({ seed: 8, width: 128, height: 64 });
  const otherTerrain = makeTerrain(other.world, other.planet);
  let same = 0;
  for (let i = 0; i < 200; i++) {
    const x = i * 211, z = i * 397;
    if (Math.abs(otherTerrain.heightAt(x, z) - terrain.heightAt(x, z)) < 0.5) same++;
  }
  assert.ok(same < 40, `${same}/200 points identical — the seed is not reaching the terrain`);
});

test('the ground follows the map it was made from', () => {
  // at a cell centre, the walked height must be the map height plus only the detail noise
  const world = run.world;
  let worst = 0;
  for (let cy = 4; cy < world.height - 4; cy += 7) {
    for (let cx = 4; cx < world.width - 4; cx += 7) {
      // `terrain.relief` is the SCALED relief, not the planet's raw one: round 4b matched the
      // vertical scale to how wide the map actually is (see makeTerrain), so comparing against
      // world.relief would be comparing two different worlds.
      const mapMetres = elevationToMetres(world.elevation[cy * world.width + cx], terrain.relief);
      const walked = terrain.heightAt(cx * M_PER_CELL, cy * M_PER_CELL);
      worst = Math.max(worst, Math.abs(walked - mapMetres));
    }
  }
  assert.ok(worst < 130, `the ground drifts ${Math.round(worst)} m from the map — detail noise is too loud`);
});

test('slopes and normals agree with each other', () => {
  for (let i = 0; i < 200; i++) {
    const x = (i * 613) % terrain.widthM, z = (i * 811) % terrain.depthM;
    const slope = terrain.slopeAt(x, z);
    const n = terrain.normalAt(x, z);
    assert.ok(Number.isFinite(slope) && slope >= 0);
    assert.ok(Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) < 1e-6, 'the normal is not a unit vector');
    assert.ok(n[1] > 0, 'the ground never faces downward');
    // a steeper slope means a normal tipped further from straight up
    assert.ok(Math.abs(n[1] - 1 / Math.sqrt(1 + slope * slope)) < 0.06);
  }
});

test('colours come back in range and change with the biome', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const x = (i * 1237) % terrain.widthM, z = (i * 907) % terrain.depthM;
    const c = terrain.colorAt(x, z);
    for (const v of c) assert.ok(v >= 0 && v <= 1, `colour channel ${v} out of range`);
    seen.add(c.map(v => Math.round(v * 12)).join(','));
  }
  assert.ok(seen.size > 20, `only ${seen.size} distinct colours — the world looks flat`);
});

test('you start on dry land you can stand on, and cannot walk off the map', () => {
  const spawn = terrain.spawnPoint();
  assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z));
  assert.ok(!isWater(terrain.biomeIdAt(spawn.x, spawn.z)), 'spawned in the sea');
  if (terrain.hasSea) assert.ok(spawn.height > 0, 'spawned below sea level');
  assert.ok(terrain.slopeAt(spawn.x, spawn.z, 6) < 0.6, 'spawned on a cliff face');

  // Longitude WRAPS and latitude clamps — a world map is a sphere unrolled, so walking east far
  // enough brings you round to the west. Only the poles are a wall.
  const [wx, wz] = terrain.clampToWorld(-500, -500);
  assert.ok(wx > terrain.widthM - 600 && wx <= terrain.widthM, `west of the map should wrap east, got ${wx}`);
  assert.equal(wz, 0, 'north of the map is the pole, and clamps');
  const [ex, ez] = terrain.clampToWorld(terrain.widthM + 500, 1e9);
  assert.ok(ex < 600, `east of the map should wrap west, got ${ex}`);
  assert.equal(ez, terrain.depthM, 'south of the map is the pole, and clamps');
  // and the ground is continuous across the seam, not a cliff
  const east = terrain.heightAt(terrain.widthM - 1, terrain.depthM / 2);
  const west = terrain.heightAt(1, terrain.depthM / 2);
  assert.ok(Math.abs(east - west) < 900, `the seam is a ${Math.round(Math.abs(east - west))} m cliff`);
});

test('landing prefers a world you can live on', () => {
  const { system } = createSystem({ seed: 21 });
  const landing = chooseLanding(system);
  assert.ok(!landing.giant);
  const better = system.planets.find(p => p.atmosphere?.breathable && !p.giant);
  if (better) assert.ok(landing.atmosphere?.breathable, 'passed over a breathable world');
  assert.match(describePlanet(landing, system.star), /g,/);
});

test('a habitable start finds a lived-in, multi-biome world, and says when it moved the seed', () => {
  // The user asked for the starting planet to always be a multi-biome world that starts you in a
  // town, defaulting to on. Roughly a quarter of seeds do not have one in the first system, so
  // createWorld walks seed+1, seed+2… until it finds one rather than failing.
  const bad = createWorld({ seed: 1, width: 96, height: 48 });
  const good = createWorld({ seed: 1, width: 96, height: 48, habitable: true });
  assert.ok(isHabitableStart(good.planet), 'the habitable start landed somewhere uninhabitable');
  assert.ok(good.world.nodes.some(n => n.kind === 'town' || n.kind === 'city'),
    'a habitable start with no settlement on the map');
  assert.equal(good.movedSeed, good.systemSeed !== 1);
  if (!isHabitableStart(bad.planet)) {
    assert.notEqual(good.systemSeed, bad.systemSeed, 'seed 1 is uninhabitable but the search stayed put');
    assert.equal(good.movedSeed, true);
  }
});

test('the habitable search is repeatable and always lands somewhere', () => {
  for (const seed of [1, 2, 5, 13, 31, 1337]) {
    const a = createWorld({ seed, width: 64, height: 32, habitable: true });
    const b = createWorld({ seed, width: 64, height: 32, habitable: true });
    assert.equal(a.systemSeed, b.systemSeed, `seed ${seed} chose a different system on the second run`);
    assert.ok(a.planet, `seed ${seed} found nothing to land on`);
    assert.ok(isHabitableStart(a.planet), `seed ${seed} settled for an uninhabitable world`);
    assert.ok(a.systemSeed >= seed && a.systemSeed < seed + 25, 'the search ran past its own limit');
  }
});
