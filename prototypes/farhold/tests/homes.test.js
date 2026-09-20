// js/homes.js — the register of bases that outlives a planet.
//
// "It should be easy to teleport back to your bases even if you go to a different star system."
// The whole point of this file is that the per-world waypoint network is thrown away on every
// landing and this is not, so most of these tests are about what survives that.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomes } from '../js/homes.js';

const HERE = { systemSeed: 11, planetId: 2 };
const base = (over = {}) => ({
  id: 'b1', name: 'Ash Camp', x: 1200, z: 800, claim: 'c1',
  starId: 3, systemSeed: 11, starName: 'Vell', planetId: 2, planetName: 'Vell II',
  ...over,
});

test('a base is filed and comes back out', () => {
  const h = createHomes();
  assert.equal(h.add(base()).ok, true);
  assert.equal(h.count, 1);
  assert.equal(h.byId('b1').name, 'Ash Camp');
});

test('the same base cannot be filed twice, and a claim gets one pad', () => {
  const h = createHomes();
  h.add(base());
  assert.equal(h.add(base()).ok, false, 'the same id went on twice');
  const second = h.add(base({ id: 'b2' }));
  assert.equal(second.ok, false, 'one claim took two waypoints');
  assert.match(second.why, /One per base/);
  // …but the SAME claim id on a different world is a different claim
  assert.equal(h.add(base({ id: 'b3', systemSeed: 99, planetId: 1 })).ok, true);
});

test('forWorld hands back only this world, in the shape createWaypoints wants', () => {
  const h = createHomes();
  h.add(base());
  h.add(base({ id: 'b2', claim: 'c2', systemSeed: 99, planetId: 1, planetName: 'Oro I' }));
  const mine = h.forWorld(HERE);
  assert.equal(mine.length, 1);
  assert.deepEqual(Object.keys(mine[0]).sort(), ['claim', 'faction', 'id', 'name', 'powered', 'x', 'z']);
  assert.equal(h.elsewhere(HERE).length, 1);
});

test('a world is BOTH numbers — same planet id under a different star is not home', () => {
  const h = createHomes();
  h.add(base());
  // every world uses the same metre grid, so planetId 2 exists in every system; matching on it
  // alone would teleport the player to the wrong planet at the right coordinates
  assert.equal(h.forWorld({ systemSeed: 99, planetId: 2 }).length, 0);
  assert.equal(h.forWorld({ systemSeed: 11, planetId: 7 }).length, 0);
  assert.equal(h.forWorld({ systemSeed: null, planetId: null }).length, 0);
});

test('routeTo names the three legs', () => {
  const h = createHomes();
  h.add(base());
  h.add(base({ id: 'b2', claim: 'c2', planetId: 5, planetName: 'Vell V' }));
  h.add(base({ id: 'b3', claim: 'c3', starId: 9, systemSeed: 99, starName: 'Oro', planetId: 1 }));

  assert.equal(h.routeTo('b1', HERE).step, 'here');
  assert.equal(h.routeTo('b1', HERE).legs, 1);
  assert.equal(h.routeTo('b2', HERE).step, 'land');
  assert.equal(h.routeTo('b2', HERE).planetId, 5);
  const far = h.routeTo('b3', HERE);
  assert.equal(far.step, 'jump');
  assert.equal(far.systemSeed, 99);
  assert.match(far.why, /Oro/);
});

test('a dark pad is refused, and it says the grid rather than the travel history', () => {
  const h = createHomes();
  h.add(base());
  h.setPowered('b1', false);
  const r = h.routeTo('b1', HERE);
  assert.equal(r.ok, false);
  assert.match(r.why, /dark/);
  h.setPowered('b1', true);
  assert.equal(h.routeTo('b1', HERE).ok, true);
});

test('the overview puts the nearest trip first', () => {
  const h = createHomes();
  h.add(base({ id: 'far', claim: 'cf', systemSeed: 99, planetId: 1, name: 'Far Rig' }));
  h.add(base({ id: 'sys', claim: 'cs', planetId: 5, name: 'Sister World' }));
  h.add(base({ id: 'home', claim: 'ch', name: 'Ash Camp' }));
  const rows = h.overview({ ...HERE, x: 0, z: 0 });
  assert.deepEqual(rows.map(r => r.name), ['Ash Camp', 'Sister World', 'Far Rig']);
  assert.equal(rows[0].away, Math.hypot(1200, 800));
  assert.equal(rows[2].away, null, 'a base on another world was given a distance in metres');
});

test('the register survives a save and a load', () => {
  const h = createHomes();
  h.add(base());
  h.add(base({ id: 'b2', claim: 'c2', systemSeed: 99, planetId: 1 }));
  const json = JSON.parse(JSON.stringify(h.toJSON()));
  const back = createHomes(json);
  assert.equal(back.count, 2);
  assert.equal(back.routeTo('b2', HERE).step, 'jump');
  assert.equal(back.forWorld(HERE).length, 1);
});

test('knocking one down takes it off the list and off the route', () => {
  const h = createHomes();
  h.add(base());
  assert.equal(h.remove('b1'), true);
  assert.equal(h.remove('b1'), false);
  assert.equal(h.routeTo('b1', HERE).ok, false);
});
