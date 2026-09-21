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
  // R15: a plain camp is no longer a row — "we don't need a pointer to those" — so these are the
  // things that ARE errands: jobs you are carrying.
  const rows = nearbyList({
    at,
    quests: [
      { id: 'f', title: 'Far camp', place: { x: 1600, z: 1000 } },
      { id: 'n', title: 'Near camp', place: { x: 1080, z: 1000 } },
      { id: 'm', title: 'Mid camp', place: { x: 1300, z: 1000 } },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['Near camp', 'Mid camp', 'Far camp']);
  assert.equal(rows[0].where, '80 m');
  assert.equal(rows[0].compass, 'E');
});

test('a clock about to run out beats distance — that is the whole point of the panel', () => {
  const rows = nearbyList({
    at,
    quests: [{ id: 'q', title: 'Right here', place: { x: 1005, z: 1000 } }],
    events: [{ id: 'e1', name: 'Cage on the cart', x: 2000, z: 1500, left: 9 }],
  });
  assert.equal(rows[0].name, 'Cage on the cart', 'a rescue about to fail was buried under a camp');
  assert.equal(rows[1].name, 'Right here');

  // …but an event with plenty of time left sorts by distance like everything else
  const calm = nearbyList({
    at,
    quests: [{ id: 'q', title: 'Right here', place: { x: 1005, z: 1000 } }],
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
  const quests = Array.from({ length: 12 }, (_, i) => ({ id: 'q' + i, title: 'Job ' + i, place: { x: 1000 + i * 10, z: 1000 } }));
  const rows = nearbyList({ at, quests, limit: 5 });
  assert.equal(rows.length, 5);
  assert.equal(rows.total, 12);
  assert.equal(rows.more, 7);
});

test('nothing past the range is anybody nearby', () => {
  const rows = nearbyList({
    at,
    quests: [
      { id: 'a', title: 'In range', place: { x: 1000 + NEARBY_RANGE - 10, z: 1000 } },
      { id: 'b', title: 'Out of range', place: { x: 1000 + NEARBY_RANGE + 10, z: 1000 } },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['In range']);
});

test('the order is stable, so rows do not swap places while you walk', () => {
  const quests = [
    { id: 'b', title: 'B', place: { x: 1100, z: 1000 } },
    { id: 'a', title: 'A', place: { x: 1100, z: 1000 } },   // exactly the same distance
  ];
  const one = nearbyList({ at, quests }).map(r => r.id);
  const two = nearbyList({ at, quests: [...quests].reverse() }).map(r => r.id);
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
    sites: [{ key: 'done', name: 'Cleared lair', x: 1050, z: 1000, worldBoss: true, cleared: true }],
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

/**
 * R15 — "Remove waypoints for things that aren't consumable like bandit camps, we don't need a
 * pointer to those."
 *
 * The distinction is whether the thing RUNS OUT. A bandit camp does not: it is scenery with people
 * in it, there are several within a walk of anywhere, and a beacon over each one turns the panel
 * into wallpaper — the same fault the ambient chatter had. A world boss is one per planet and gone
 * once you kill it. A job is gone when you finish it.
 */
test('a bandit camp is not an activity, and a world boss is', () => {
  const rows = nearbyList({
    at,
    sites: [
      { key: 'camp1', name: 'Burn Camp', x: 1040, z: 1000 },
      { key: 'camp2', name: 'Raider Stockade', x: 1060, z: 1000 },
      { key: 'boss', name: 'The Standing Ruin', x: 1400, z: 1000, worldBoss: true },
    ],
  });
  assert.deepEqual(rows.map(r => r.name), ['The Standing Ruin'],
    'a camp came back as a row — there are several near anywhere and they never run out');
  assert.equal(rows[0].kind, 'foe');
});

test('…but a camp you have been PAID to clear is still a row', () => {
  // the job carries the place, so the one camp that is an errand stays and the identical camp
  // beside it does not. That is the whole distinction, and it is worth a test of its own.
  const rows = nearbyList({
    at,
    sites: [{ key: 'camp1', name: 'Burn Camp', x: 1040, z: 1000 }],
    quests: [{ id: 'q1', title: 'Clear the Burn Camp', place: { x: 1040, z: 1000 }, progress: '0 / 4' }],
  });
  assert.deepEqual(rows.map(r => r.name), ['Clear the Burn Camp']);
  assert.equal(rows.length, 1, 'the camp and the job about it must not both be listed');
});
