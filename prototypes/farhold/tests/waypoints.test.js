// node --test prototypes/farhold/tests/waypoints.test.js
//
// "Waypoints should work like Diablo 2, always there but they have to be activated by entering the
// city first. No need to get physically close to them though, entering the city boundaries is
// enough." And: one design everywhere, towns only, and you arrive standing on the sigil.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWaypoints, boundaryOf, padSpotFor } from '../js/waypoints.js';

const towns = [
  { id: 1, name: 'Pebelkeep', size: 4, wx: 0, wz: 0 },
  { id: 2, name: 'Hollowcrown', size: 6, wx: 4000, wz: 0 },
  { id: 3, name: 'Thornwatch', size: 1, wx: 0, wz: 9000 },
];
const make = () => createWaypoints({ settlements: towns, seed: 7 });

test('every settlement has a pad, and none of them starts lit', () => {
  const w = make();
  assert.equal(w.list().length, 3);
  assert.ok(w.list().every(p => !p.lit), 'a pad is inert until you have been there');
  assert.equal(w.count, 0);
});

test('entering the boundary lights it — you do not have to walk to the pad', () => {
  const w = make();
  const town = towns[0];
  const edge = boundaryOf(town);
  // stand just inside the boundary, nowhere near the pad itself
  const here = w.settlementAt(town.wx + edge - 1, town.wz);
  assert.equal(here?.id, town.id);
  assert.ok(w.visit(here), 'arriving should light it');
  assert.ok(w.isLit(town.id));
  // …and just outside is still outside
  assert.equal(w.settlementAt(town.wx + edge + 40, town.wz), null);
});

test('lighting one is a one-off, so the game can announce it once', () => {
  const w = make();
  assert.ok(w.visit(towns[0]), 'the first visit reports');
  assert.equal(w.visit(towns[0]), null, 'the second says nothing');
});

test('a bigger settlement has a bigger boundary', () => {
  assert.ok(boundaryOf(towns[1]) > boundaryOf(towns[0]));
  assert.ok(boundaryOf(towns[0]) > boundaryOf(towns[2]));
});

test('the pad is beside the square, in the same relative place in every town', () => {
  // one design everywhere means it is findable without a marker, which means a fixed bearing
  const a = padSpotFor(towns[0]), b = padSpotFor(towns[1]);
  const bearing = t => Math.atan2(t.z - 0, t.x - (t === b ? 4000 : 0));
  assert.ok(Math.abs(bearing(a) - bearing(b)) < 1e-9, 'the pad sits at a different bearing per town');
  assert.notEqual(a.x, towns[0].wx, 'the pad should not be on top of the well');
});

test('you cannot travel to somewhere you have never been', () => {
  const w = make();
  const no = w.canTravel(2, {});
  assert.equal(no.ok, false);
  assert.match(no.why, /have not been to Hollowcrown/);
  w.visit(towns[1]);
  assert.equal(w.canTravel(2, {}).ok, true);
});

test('travel is blocked in a fight and underground, and says why', () => {
  const w = make();
  w.visit(towns[1]);
  assert.match(w.canTravel(2, { fighting: true }).why, /trying to kill you/);
  assert.match(w.canTravel(2, { underground: true }).why, /underground/);
  assert.match(w.canTravel(2, { fromId: 2 }).why, /already in Hollowcrown/);
});

test('travel costs hours, scaled by how far you actually went', () => {
  const w = make();
  w.visit(towns[1]);
  const pad = w.byId(2);
  const near = w.hoursFor(pad.x - 200, pad.z, pad);
  const far = w.hoursFor(pad.x - 60000, pad.z, pad);
  assert.ok(far > near, 'crossing the world should cost more than hopping next door');
  assert.ok(near >= 0.5, 'even a short hop takes a moment');
  assert.ok(far <= 24, 'and nothing takes more than a day');
});

test('the lit network survives a save and reload', () => {
  const w = make();
  w.visit(towns[0]);
  w.visit(towns[1]);
  w.noteDeparture(123, 456, 'Xaetrix 6E III');

  const back = make();
  assert.equal(back.count, 0);
  back.load(w.toJSON());
  assert.equal(back.count, 2);
  assert.ok(back.isLit(1) && back.isLit(2) && !back.isLit(3));
  assert.deepEqual(back.departure, { x: 123, z: 456, world: 'Xaetrix 6E III' });
});

test('loading over an existing book replaces it rather than adding to it', () => {
  const w = make();
  w.visit(towns[2]);
  w.load({ lit: [1] });
  assert.ok(w.isLit(1));
  assert.ok(!w.isLit(3), 'the old network should be gone, not merged');
});
