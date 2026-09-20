// R14 — the Nearby Activities list.
//
//   "Add a 'Nearby Activities' area below the minimap when walking around… It should show what
//    nearby activities are available including the ones that pop up in chat or have a location
//    nearby."
//
// The module is pure, so the sort order is something to assert rather than squint at.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyList, mmss, NEARBY_ICONS, URGENT_SECONDS, NEARBY_RANGE } from '../js/nearby.js';

const at = { x: 1000, z: 1000 };

test('nearest first', () => {
  const rows = nearbyList({
    at,
    sites: [
      { key: 'far', name: 'Far camp', x: 1600, z: 1000 },
      { key: 'near', name: 'Near camp', x: 1080, z: 1000 },
      { key: 'mid', name: 'Mid camp', x: 1300, z: 1000 },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['Near camp', 'Mid camp', 'Far camp']);
  assert.equal(rows[0].where, '80 m');
  assert.equal(rows[0].compass, 'E');
});

test('a clock about to run out beats distance — that is the whole point of the panel', () => {
  const rows = nearbyList({
    at,
    sites: [{ key: 'next-door', name: 'Right here', x: 1005, z: 1000 }],
    events: [{ id: 'e1', name: 'Cage on the cart', x: 2000, z: 1500, left: 9 }],
  });
  assert.equal(rows[0].name, 'Cage on the cart', 'a rescue about to fail was buried under a camp');
  assert.equal(rows[1].name, 'Right here');

  // …but an event with plenty of time left sorts by distance like everything else
  const calm = nearbyList({
    at,
    sites: [{ key: 'next-door', name: 'Right here', x: 1005, z: 1000 }],
    events: [{ id: 'e1', name: 'Cage on the cart', x: 2000, z: 1500, left: 300 }],
  });
  assert.equal(calm[0].name, 'Right here');
});

test('two clocks both running out: the tighter one first', () => {
  const rows = nearbyList({
    at,
    events: [
      { id: 'a', name: 'Eight left', x: 1010, z: 1000, left: 8 },
      { id: 'b', name: 'Two left', x: 1500, z: 1000, left: 2 },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['Two left', 'Eight left']);
});

test('the list is capped, and says how many it did not show', () => {
  const sites = Array.from({ length: 12 }, (_, i) => ({ key: 's' + i, name: 'Camp ' + i, x: 1000 + i * 10, z: 1000 }));
  const rows = nearbyList({ at, sites, limit: 5 });
  assert.equal(rows.length, 5);
  assert.equal(rows.total, 12);
  assert.equal(rows.more, 7);
});

test('nothing past the range is anybody nearby', () => {
  const rows = nearbyList({
    at,
    sites: [
      { key: 'in', name: 'In range', x: 1000 + NEARBY_RANGE - 10, z: 1000 },
      { key: 'out', name: 'Out of range', x: 1000 + NEARBY_RANGE + 10, z: 1000 },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['In range']);
});

test('the order is stable, so rows do not swap places while you walk', () => {
  const sites = [
    { key: 'b', name: 'B', x: 1100, z: 1000 },
    { key: 'a', name: 'A', x: 1100, z: 1000 },   // exactly the same distance
  ];
  const one = nearbyList({ at, sites }).map(r => r.id);
  const two = nearbyList({ at, sites: [...sites].reverse() }).map(r => r.id);
  assert.deepEqual(one, two, 'the same two things at the same distance came out in a different order');
});

test('a person with nothing to offer is not an activity', () => {
  const rows = nearbyList({
    at,
    folk: [
      { id: 'p1', name: 'A pedlar', x: 1050, z: 1000, offer: 'wants an escort' },
      { id: 'p2', name: 'Somebody walking', x: 1050, z: 1000 },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['A pedlar']);
  assert.equal(rows[0].state, 'wants an escort');
});

test('a cleared camp stops being news, and a job you have done stops being a row', () => {
  const rows = nearbyList({
    at,
    sites: [{ key: 'done', name: 'Cleared camp', x: 1050, z: 1000, cleared: true }],
    quests: [
      { id: 'q1', title: 'Finished', place: { x: 1050, z: 1000 }, done: true },
      { id: 'q2', title: 'Still going', place: { x: 1060, z: 1000 }, progress: '2 / 5' },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['Still going']);
});

test('a meteor in the air and a job both get a row, and the icons are the map\'s own', () => {
  const rows = nearbyList({
    at,
    meteors: [{ x: 1200, z: 1000, secondsLeft: 18 }],
    quests: [{ id: 'q1', title: 'Something came down', markerKind: 'fall', place: { x: 1200, z: 1000 } }],
  });
  assert.equal(rows[0].kind, 'fall', 'the falling one, with 18 seconds on it, should lead');
  assert.equal(NEARBY_ICONS.fall, '☄', 'the impact glyph must match MARKER_LOOKS.fall');
  assert.equal(NEARBY_ICONS.quest, '!', 'the quest glyph must match MARKER_LOOKS.quest');
});

test('nothing anywhere gives an empty list rather than a crash', () => {
  const rows = nearbyList({});
  assert.deepEqual([...rows], []);
  assert.equal(rows.total, 0);
  assert.equal(rows.more, 0);
});

test('clocks read the way a clock reads', () => {
  assert.equal(mmss(64), '1:04');
  assert.equal(mmss(7), '0:07');
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(null), '');
  assert.equal(URGENT_SECONDS, 30);
});
