// node --test prototypes/farhold/tests/round8.test.js
//
// Round 8 is the world: towns you can walk around, water that nothing grows in, a level curve that
// runs to fifty, planets banded by how hard they are, and something that falls out of the sky.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld, makeTerrain, createSystem, landableBodies, M_PER_CELL } from '../js/planet.js';
// The catalogue is Three-free (js/town-plan.js); the geometry that reads it is not, so the tests
// drive the facts rather than the meshes — the same split as dungeon-plan.js and water-plan.js.
import { BUILDING_INFO, NEW_BUILDINGS, wantsFor, streetPlan, footprintOf } from '../js/town-plan.js';
import { BUILDING_SOLIDS } from '../js/collide.js';
import { xpForLevel, MAX_LEVEL, PLANET_BANDS, bandForPlanet, Rpg } from '../js/rpg.js';
import { gatherable, submitGather, makeQuest } from '../js/quests.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const balance = read('../data/balance.json');
const items = read('../../emberveil/data/items.json');

// ---------------------------------------------------------------- towns

test('a town has twelve more kinds of building, and each one can be walked into', () => {
  // "Let's also update towns to be more complex, have 12 new bespoke buildings"
  assert.equal(NEW_BUILDINGS.length, 12);
  for (const key of NEW_BUILDINGS) {
    assert.ok(BUILDING_INFO[key], `${key} is not in the catalogue`);
    assert.ok(BUILDING_INFO[key].cap > 0, `${key} has no instance budget`);
    assert.ok(BUILDING_SOLIDS[key], `${key} has no collision — you would walk through it`);
    const [radius, height] = BUILDING_SOLIDS[key];
    assert.ok(radius > 0 && height > 0, `${key} is not solid`);
  }
  // …and a street is the one thing you are meant to walk ON
  assert.ok(BUILDING_INFO.street, 'no streets');
  assert.deepEqual(BUILDING_SOLIDS.street, [0, 0], 'a street should not stop you');
  assert.deepEqual(BUILDING_SOLIDS.bridge, [0, 0], 'a bridge is to be walked on, not into');
});

test('a town plan grows with the settlement, and drops the right things when it is small', () => {
  // the order is the design: the trades are at the top, so a hamlet does without the ornaments
  const hamlet = wantsFor(0), village = wantsFor(2), city = wantsFor(5);
  assert.ok(hamlet.length < village.length, 'a hamlet wants as much as a village');
  assert.ok(village.length < city.length, 'a village wants as much as a city');
  assert.ok(!hamlet.includes('barracks'), 'a hamlet should not have a barracks');
  assert.ok(city.includes('forge') && city.includes('inn') && city.includes('barracks'));
  for (const key of city) assert.ok(BUILDING_INFO[key], `${key} is wanted but does not exist`);

  // more streets for a bigger place, and all of them leave the square
  const small = streetPlan(1, 29, () => 0.5), big = streetPlan(5, 81, () => 0.5);
  assert.ok(big.length > small.length, 'a city has no more streets than a hamlet');
  for (const st of big) assert.ok(st.length > 0 && Number.isFinite(st.heading));

  // the footprint is what the quiet ground is measured from
  assert.ok(footprintOf(5).wall > footprintOf(1).wall);
  assert.equal(footprintOf(5).walled, true);
  assert.equal(footprintOf(1).walled, false);
});

test('every building in the catalogue is solid, capped and knows who it is for', () => {
  for (const [key, info] of Object.entries(BUILDING_INFO)) {
    assert.ok(info.cap > 0, `${key} has no instance budget`);
    assert.ok(Array.isArray(info.solid) && info.solid.length === 2, `${key} has no collision shape`);
    assert.ok(Number.isFinite(info.from), `${key} does not say what size of settlement wants it`);
    assert.deepEqual(BUILDING_SOLIDS[key], info.solid, `${key} disagrees with the collision table`);
  }
  // the roles a building names have to be real ones somebody can stand in
  const roles = ['merchant', 'elder', 'smith', 'innkeeper', 'guard', 'gambler', 'villager'];
  for (const [key, info] of Object.entries(BUILDING_INFO)) {
    if (info.role) assert.ok(roles.includes(info.role), `${key} names a role nobody has: ${info.role}`);
  }
});

// ---------------------------------------------------------------- water and towns

test('no lake sits in the middle of a town', () => {
  // "We should also fix an issue I witnessed where a town had a lake right in the middle."
  for (const seed of [1337, 7, 19, 3]) {
    const run = createWorld({ seed, width: 128, height: 64 });
    const terrain = makeTerrain(run.world, run.planet);
    const towns = (run.world.nodes || []).filter(n => n.type === 'settlement');
    let inside = 0;
    for (const lake of terrain.lakes) {
      for (const i of lake.cells) {
        const x = i % run.world.width, y = Math.floor(i / run.world.width);
        for (const t of towns) {
          const reach = 1 + Math.round((t.size || 1) * 0.6);
          if (Math.hypot(t.x - x, t.y - y) <= reach) inside++;
        }
      }
    }
    assert.equal(inside, 0, `seed ${seed} still has lake cells inside a settlement`);
  }
});

test('a road is never under water', () => {
  // "I found a case where the road was underwater. Roads should be safely above water level."
  for (const seed of [1337, 7, 19]) {
    const run = createWorld({ seed, width: 128, height: 64 });
    const terrain = makeTerrain(run.world, run.planet);
    let under = 0, checked = 0;
    for (const road of terrain.roadPaths) {
      for (let i = 0; i < road.points.length; i++) {
        const [x, z] = road.points[i];
        const surface = road.surface[i];
        // a sea lane is not drawn as a road at all — see `path.wet`
        if (road.wet?.[i]) continue;
        checked++;
        if (terrain.hasSea && surface < terrain.seaLevel) { under++; continue; }
        const water = terrain.waterAt(x, z);
        if (water && water.kind === 'lake' && surface < water.surface) under++;
      }
    }
    assert.ok(checked > 100, `seed ${seed} has almost no road to check`);
    assert.equal(under, 0, `seed ${seed} has ${under} drawn road points under water`);
    // …and the wet spans really are out at sea rather than being quietly dropped everywhere
    const wet = terrain.roadPaths.reduce((n, r) => n + (r.wet || []).filter(Boolean).length, 0);
    assert.ok(wet < checked * 0.25, `seed ${seed} calls ${wet} of ${checked} road points a sea lane`);
  }
});

test('nothing grows in the water, and `plantable` is stricter than `underwater`', () => {
  // "I found a case where trees and grass were growing underwater in a lake."
  const run = createWorld({ seed: 1337, width: 128, height: 64 });
  const terrain = makeTerrain(run.world, run.planet);
  assert.equal(typeof terrain.plantable, 'function');

  const lake = [...terrain.lakes].sort((a, b) => b.cells.length - a.cells.length)[0];
  assert.ok(lake, 'this world has no lake to stand beside');
  const rng = makeRng(5);
  let shallows = 0, checked = 0;
  for (let i = 0; i < 3000; i++) {
    const a = rng() * Math.PI * 2, r = lake.radius * (0.4 + rng());
    const x = lake.wx + Math.cos(a) * r, z = lake.wz + Math.sin(a) * r;
    checked++;
    // anything the stricter test rejects must be at or under the water it is beside
    if (!terrain.underwater(x, z) && !terrain.plantable(x, z)) shallows++;
    // and nothing may be plantable while standing in water
    if (terrain.underwater(x, z)) assert.equal(terrain.plantable(x, z), false, 'a tree in open water');
  }
  assert.ok(checked > 1000);
  assert.ok(shallows > 0, 'the stricter test rejects nothing — it is doing no work');
});

// ---------------------------------------------------------------- levels and bands

test('the level cap is fifty, and the curve has the shape that was asked for', () => {
  // "Raise the max level to 50, but make the curve from 30-40 take about as much xp as it does from
  // 1-30, and even worse through level 50."
  assert.equal(MAX_LEVEL, 50);
  const to30 = xpForLevel(30), to40 = xpForLevel(40), to50 = xpForLevel(50);
  const first = to30, second = to40 - to30, third = to50 - to40;
  assert.ok(Math.abs(second / first - 1) < 0.15, `30->40 costs ${(second / first).toFixed(2)}x the first thirty`);
  assert.ok(third / first > 1.5, `40->50 costs only ${(third / first).toFixed(2)}x — it should be worse again`);
  // and it climbs the whole way, with no step backwards anywhere
  for (let l = 2; l <= MAX_LEVEL; l++) {
    assert.ok(xpForLevel(l) > xpForLevel(l - 1), `level ${l} costs no more than ${l - 1}`);
  }
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(60), xpForLevel(50), 'past the cap should not keep climbing');
});

test('planets are banded low, medium and high, and every system carries all three', () => {
  assert.deepEqual(PLANET_BANDS.map(b => b.key), ['low', 'medium', 'high']);
  assert.deepEqual(PLANET_BANDS.map(b => [b.min, b.max]), [[1, 30], [30, 40], [40, 50]]);
  for (const b of PLANET_BANDS) assert.ok(b.name && b.blurb, `${b.key} is not described`);

  // Round 10: a moon is a landing target too (own id, own seed, own surface map), so it counts
  // toward "somewhere to go at every level" — `landableBodies` is the list the game actually offers.
  for (const seed of [1, 7, 19, 1337, 777, 42]) {
    const { system } = createSystem({ seed });
    const bodies = landableBodies(system);
    assert.ok(bodies.length >= 3, `seed ${seed} has only ${bodies.length} landable bodies`);
    const bands = new Set(bodies.map(p => bandForPlanet(p).key));
    assert.equal(bands.size, 3, `seed ${seed} is missing a band: has ${[...bands].join(', ')}`);
  }
});

test('a system is fuller than it was, and a forced band changes nothing else', () => {
  let total = 0;
  for (const seed of [1, 7, 19, 1337, 777]) {
    const { system } = createSystem({ seed });
    total += system.planets.length;
  }
  assert.ok(total / 5 >= 4, `only ${(total / 5).toFixed(1)} planets a system on average`);

  // forcing is a label on the level range, not a change to the world itself
  const { system } = createSystem({ seed: 1 });
  const planet = system.planets.find(p => p.forcedBand);
  if (planet) {
    assert.equal(bandForPlanet(planet).key, planet.forcedBand);
    assert.ok(planet.archetype, 'forcing a band should not have replaced the world');
  }
});

// ---------------------------------------------------------------- meteors

test('a meteorite chest is an event drop, always rare or better', () => {
  const meteorite = balance.chests.kinds.meteorite;
  assert.ok(meteorite, 'no meteorite chest');
  assert.equal(meteorite.weight, 0, 'a meteorite should never be scattered like an ordinary chest');
  assert.equal(meteorite.floor, 'rare');
  assert.deepEqual(meteorite.items, [1, 3]);
  assert.ok(meteorite.rarityBoost > 2, 'a meteorite should be worth the walk');

  // and the roller really does honour that floor
  const rpg = new Rpg(items, balance);
  const rng = makeRng(3);
  const RANKS = ['normal', 'magic', 'rare', 'legendary'];
  for (let i = 0; i < 200; i++) {
    const item = rpg.rollDrop({ level: 20, rng, chance: 1, floor: 'rare', rarityBoost: meteorite.rarityBoost });
    assert.ok(RANKS.indexOf(item.rarity) >= 2, `a meteorite dropped a ${item.rarity}`);
  }
});

test('the meteor knobs describe the event that was asked for', () => {
  const m = balance.meteors;
  assert.ok(m, 'no meteor settings');
  assert.equal(m.everySeconds, 300, 'a chance every five minutes');
  assert.equal(m.fallSeconds, 30, 'it should take thirty seconds to come down');
  assert.ok(m.chance > 0 && m.chance <= 1);
  const [lo, hi] = m.landRange;
  assert.ok(lo > 100, 'landing on your head is not an event');
  assert.ok(hi > lo && hi < 3000, 'landing in the next region is not an event either');
  assert.ok(m.shootingEvery > 0, 'no shooting stars between them');
});

// ---------------------------------------------------------------- gather quests

test('a gather job takes what you are already carrying, and only what you pick', () => {
  // "I had a quest to collect 6 daggers. I actually had 6 daggers on me, but I had to go witness
  // them drop. It should have just let me use the ones I had on me."
  const rpg = new Rpg(items, balance);
  const rng = makeRng(11);
  const quest = makeQuest('gather', {
    rng, level: 5, giver: { id: 'g1', name: 'Someone' }, enemies: [], nodes: [], terrain: null,
  });
  assert.ok(quest && quest.kind === 'gather');
  quest.target = 'dagger';
  quest.count = 3;
  quest.progress = 0;

  const bag = [];
  for (let i = 0; i < 5; i++) bag.push(rpg.loot.generate('dagger', 'normal', 'medium', { rng, level: 5 }));
  bag.push(rpg.loot.generate('sword', 'rare', 'fine', { rng, level: 5 }));   // the one to keep

  const usable = gatherable(quest, bag);
  assert.equal(usable.length, 5, 'the daggers already in the bag were invisible');
  assert.ok(!usable.includes(bag[5]), 'a sword counted toward a dagger job');

  // hand over two of them: only those two go
  const out = submitGather(quest, bag, [usable[0], usable[1]]);
  assert.equal(out.ok, true);
  assert.equal(out.taken.length, 2);
  assert.equal(out.done, false);
  assert.equal(out.left, 1);
  assert.equal(bag.length, 4, 'the wrong number of items left the bag');
  assert.ok(bag.includes(usable[2]), 'an item that was not picked was taken anyway');

  // hand over the rest — and never more than the job wants
  const rest = gatherable(quest, bag);
  const done = submitGather(quest, bag, rest);
  assert.equal(done.taken.length, 1, 'it took more than the job asked for');
  assert.equal(done.done, true);
  assert.equal(bag.length, 3, 'over-taking left the bag short');

  // …and asking again is refused rather than taking more
  const again = submitGather(quest, bag, gatherable(quest, bag));
  assert.equal(again.ok, false);
  assert.match(again.why, /already/);
});

test('a gather hand-in never touches a job of another kind', () => {
  const hunt = { kind: 'hunt', target: 'moor_hound', count: 3, progress: 0 };
  assert.deepEqual(gatherable(hunt, [{ baseKey: 'moor_hound' }]), []);
  const out = submitGather(hunt, [], []);
  assert.equal(out.ok, false);
  assert.match(out.why, /does not want items/);
});
