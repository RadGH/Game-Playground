// node --test prototypes/farhold/tests/markers.test.js
//
// "Quests/landmarks/pins should be displayed on the map and minimap… you should be able to track or
// untrack… it should also work on a planet scale, so if you have a marker on a planet it should
// have an indicator in space mode and in space maps."
//
// The book is pure data, so all of that is testable without a browser: the right markers on the
// right world, tracking that sticks, the shorter way round a wrapping map, and quests that put
// their own marker down and take it away again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkerBook, worldKey, wrapPi, distanceText, MARKER_LOOKS, MARKER_KINDS } from '../js/markers.js';
import { M_PER_CELL } from '../js/planet.js';

const world = (systemSeed, planetId, planetName = 'Somewhere') =>
  ({ systemSeed, planetId, planetName, starName: 'A Star' });

test('a marker belongs to the world it was made on, and stays there', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 2, 'Kerreth'));
  book.drop(10, 20, 'the mine');
  assert.equal(book.here().length, 1);

  // fly somewhere else: the old world's pin must not follow you
  book.setWorld(world(1, 3, 'Ossuary'));
  assert.equal(book.here().length, 0, "the last planet's pin came along");
  book.drop(4, 4, 'the crater');
  assert.equal(book.here().length, 1);

  // and it is still there when you go back
  book.setWorld(world(1, 2, 'Kerreth'));
  assert.equal(book.here()[0].name, 'the mine');

  // a different SYSTEM with the same planet id is a different world
  book.setWorld(world(99, 2, 'Elsewhere'));
  assert.equal(book.here().length, 0, 'planet ids collide across systems');
  assert.notEqual(worldKey({ systemSeed: 1, planetId: 2 }), worldKey({ systemSeed: 99, planetId: 2 }));
});

test('tracking toggles, and only tracked markers reach the minimap', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  const a = book.drop(5, 5, 'one');
  const b = book.drop(9, 9, 'two');
  assert.equal(book.tracked().length, 2, 'a new marker should start tracked');
  book.toggle(b);
  assert.equal(book.tracked().length, 1);
  assert.equal(book.tracked()[0], a);
  book.toggle(b, true);
  assert.equal(book.tracked().length, 2);
  // untracked markers are still on the world map
  book.toggle(a, false);
  assert.equal(book.here().length, 2);
});

test('quests mark themselves, and unmark themselves when they are gone', () => {
  const book = new MarkerBook();
  book.setWorld(world(7, 1));
  const quest = { id: 'q1', title: 'Carry word to Haileadhearth', place: { cell: { x: 30, y: 12 }, name: 'Haileadhearth' } };
  const noPlace = { id: 'q2', title: 'Cull the moor hounds' };
  book.syncQuests([quest, noPlace]);
  assert.equal(book.here().length, 1, 'a hunt with no destination should not get a pin');
  assert.equal(book.here()[0].kind, 'quest');
  assert.equal(book.here()[0].name, quest.title);

  // running it again must not duplicate — this is called on a timer
  book.syncQuests([quest, noPlace]);
  book.syncQuests([quest]);
  assert.equal(book.here().length, 1);

  // a finished quest shows as done, then the marker goes when it leaves the log
  quest.done = true;
  book.syncQuests([quest]);
  assert.equal(book.here()[0].done, true);
  book.syncQuests([]);
  assert.equal(book.here().length, 0);

  // a pin the player dropped is NOT swept away by a quest sync
  const pin = book.drop(1, 1, 'mine');
  book.syncQuests([]);
  assert.deepEqual(book.here(), [pin]);
});

test('a bearing takes the shorter way round a world that wraps', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  const terrain = { widthM: 100 * M_PER_CELL };
  const far = book.add({ cellX: 2, cellY: 10 });
  const player = { x: 97.5 * M_PER_CELL, z: 10.5 * M_PER_CELL, yaw: 0 };

  const wrapped = book.bearing(far, player, terrain);
  const naive = book.bearing(far, player, null);
  assert.ok(wrapped.distance < naive.distance / 10,
    `the wrap was ignored: ${Math.round(wrapped.distance)} m vs ${Math.round(naive.distance)} m the long way`);
  assert.ok(wrapped.dx > 0, 'the short way from 97 to 2 is east, over the seam');

  // straight ahead is angle 0 when you are facing it
  const south = book.add({ cellX: 50, cellY: 40 });
  const at = { x: 50.5 * M_PER_CELL, z: 10 * M_PER_CELL, yaw: 0 };   // yaw 0 faces +z
  assert.ok(Math.abs(wrapPi(book.bearing(south, at).angle)) < 0.01, 'facing it should read as dead ahead');
  assert.equal(book.bearing(south, at).ahead, true);
  // turn round and it is behind you
  assert.equal(book.bearing(south, { ...at, yaw: Math.PI }).ahead, false);
});

test('markers elsewhere are grouped by world, for space mode and the galaxy map', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0, 'Home'));
  book.drop(1, 1, 'here');
  book.setWorld(world(1, 4, 'Next Door'));
  book.drop(2, 2, 'a');
  book.drop(3, 3, 'b');
  book.setWorld(world(58, 0, 'Far Away'));
  book.drop(4, 4, 'c');
  book.toggle(book.here()[0], false);

  book.setWorld(world(1, 0, 'Home'));
  const away = book.elsewhere();
  assert.equal(away.length, 2);
  const next = away.find(g => g.planetName === 'Next Door');
  assert.equal(next.markers.length, 2);
  assert.equal(next.tracked, 2);
  assert.equal(away.find(g => g.planetName === 'Far Away').tracked, 0, 'untracked should not count');

  // per-system views: the system you are in, and every system that holds anything
  assert.equal(book.inSystem(1).length, 3);
  assert.equal(book.inSystem(58).length, 1);
  const systems = book.systems().sort((a, b) => a.systemSeed - b.systemSeed);
  assert.deepEqual(systems.map(s => s.systemSeed), [1, 58]);
  assert.equal(systems[0].count, 3);
});

test('a book survives a save and a load with its tracking intact', () => {
  const book = new MarkerBook();
  book.setWorld(world(3, 2, 'Kerreth'));
  const a = book.drop(6, 7, 'the mine');
  book.toggle(a, false);
  book.drop(8, 9, 'the ford');

  const loaded = new MarkerBook(JSON.parse(JSON.stringify(book.toJSON())));
  assert.equal(loaded.here().length, 2);
  assert.equal(loaded.tracked().length, 1);
  assert.equal(loaded.tracked()[0].name, 'the ford');
  // ids keep counting up, so a new marker cannot collide with a loaded one
  const fresh = loaded.drop(1, 1);
  assert.ok(!loaded.markers.filter(m => m !== fresh).some(m => m.id === fresh.id));
});

test('every marker kind has a glyph and a colour, so nothing draws blank', () => {
  for (const kind of MARKER_KINDS) {
    const look = MARKER_LOOKS[kind];
    assert.ok(look.icon && look.icon.length <= 2, `${kind} has no glyph`);
    assert.match(look.color, /^#[0-9a-f]{6}$/i, `${kind} has no colour`);
    assert.ok(look.label, `${kind} has no label`);
  }
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  for (const kind of MARKER_KINDS) assert.ok(book.add({ kind }).name, `${kind} defaulted to an empty name`);
});

test('distances read as people say them', () => {
  assert.equal(distanceText(310), '310 m');
  assert.equal(distanceText(2400), '2.4 km');
  assert.equal(distanceText(999), '999 m');
  assert.equal(distanceText(NaN), '');
});
