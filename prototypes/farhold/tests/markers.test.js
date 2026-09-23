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
  for (const kind of MARKER_KINDS) {
    assert.ok(book.add({ kind, cellX: 4, cellY: 7 }).name, `${kind} defaulted to an empty name`);
  }
});

/**
 * R22 — "There was a yellow quest indicator in the center of town, pointing at nothing… Quest
 * arrows should always point at something, otherwise the arrow has failed."
 *
 * `cellX` and `cellY` defaulted to 0, so a caller with nothing to give produced a valid-looking
 * marker at map cell (0, 0) — the far corner of the planet — and every consumer drew an arrow at it
 * in good faith. There is no sensible default for "where is this", so there is no default.
 */
test('a marker with no place is refused, not filed at the corner of the world', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  const warned = [];
  const real = console.warn;
  console.warn = m => warned.push(String(m));
  try {
    assert.equal(book.add({ kind: 'quest', name: 'Somewhere' }), null, 'a placeless marker was filed');
    assert.equal(book.add({ kind: 'quest', name: 'NaN', cellX: NaN, cellY: 2 }), null);
    assert.equal(book.add({ kind: 'quest', name: 'undefined', cellX: 3 }), null);
  } finally { console.warn = real; }
  assert.equal(book.markers.length, 0, 'a refused marker still went in the book');
  assert.equal(warned.length, 3, 'a marker was refused silently, which is its own kind of bug');
  assert.match(warned[0], /no place/);

  // …and one that DOES know where it is behaves exactly as it always did
  const ok = book.add({ kind: 'quest', name: 'The ford', cellX: 12, cellY: 30 });
  assert.ok(ok);
  const at = MarkerBook.position(ok);
  assert.ok(at && Number.isFinite(at.x) && Number.isFinite(at.z));

  // a marker whose cell was lost in a save round trip gets no arrow rather than taking the map down
  ok.cell = null;
  assert.equal(MarkerBook.position(ok), null);
  assert.equal(book.bearing(ok, { x: 0, z: 0, yaw: 0 }), null);
});

test('metres are enough: a quest that knows where it is but not which cell still gets a pin', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  // js/jobgen.js writes `cell: first.cell || null`, and most of what it binds to — a wanderer, a
  // caravan, a patrol — carries metres and no cell. Those jobs had no pin, arrow or explanation.
  book.syncQuests([{ id: 'q1', title: 'Find the pedlar', place: { x: 5000, z: 1800, name: 'the road' } }]);
  const m = book.markers.find(x => x.questId === 'q1');
  assert.ok(m, 'a quest with real coordinates and no cell still gets no marker');
  const at = MarkerBook.position(m);
  assert.ok(Math.abs(at.x - 5000) < 400 && Math.abs(at.z - 1800) < 400,
    `the derived cell is nowhere near the quest: ${JSON.stringify(at)}`);
});

test('distances read as people say them', () => {
  assert.equal(distanceText(310), '310 m');
  assert.equal(distanceText(2400), '2.4 km');
  assert.equal(distanceText(999), '999 m');
  assert.equal(distanceText(NaN), '');
});

// ---------------------------------------------------------------- R14: places you keep
//
//   "Add the ability to store locations and view them in a list, with a checkbox to toggle whether
//    the location is highlighted on the map with a star."
//
// A saved place is a marker with a new kind, not a second store — a second store is one more thing
// to keep in step and one more thing to forget in `snapshot()`, which is exactly how `world`,
// `quests` and `campaign` were lost for a whole round.

test('a saved place is kept, starred, and filed on the world you were standing on', () => {
  const book = new MarkerBook();
  book.setWorld(world(8812, 3));
  const m = book.save({ cellX: 118, cellY: 44, name: 'Clay bank by the ford', note: 'furnace clay' });
  assert.equal(m.kind, 'saved');
  assert.equal(m.starred, true, 'a place you deliberately kept starts highlighted');
  assert.equal(m.tracked, false, 'and does NOT start hogging the minimap arrow');
  assert.equal(m.note, 'furnace clay');
  assert.deepEqual(book.saved().map(x => x.name), ['Clay bank by the ford']);
  assert.deepEqual(book.starred().map(x => x.name), ['Clay bank by the ford']);

  // …and it is not on the next world over
  book.setWorld(world(8812, 4));
  assert.deepEqual(book.saved(), []);
});

test('saving the same place twice renames it rather than making a second row', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  book.save({ cellX: 20, cellY: 20, name: 'The ford' });
  book.save({ cellX: 21, cellY: 20, name: 'The ford, north side' });   // one cell over
  assert.equal(book.saved().length, 1, 'two rows for the same ford');
  assert.equal(book.saved()[0].name, 'The ford, north side');
  book.save({ cellX: 60, cellY: 60, name: 'Somewhere else' });
  assert.equal(book.saved().length, 2);
});

test('the star is a toggle, and it works on any kind of marker', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  const quest = book.add({ kind: 'quest', name: 'Clear the vault', cellX: 4, cellY: 4 });
  assert.equal(!!quest.starred, false);
  assert.equal(book.star(quest), true, 'starring a quest marker is a reasonable thing to want');
  assert.equal(book.star(quest), false);
  assert.equal(book.star(quest, true), true);
  assert.deepEqual(book.starred().map(m => m.name), ['Clear the vault']);
});

test('a place saved off a quest survives the quest being handed in', () => {
  // `syncQuests` deletes any marker whose `questId` has left the live log. A saved place records
  // where it came from in `from.id` for exactly that reason — being swept away the moment you hand
  // the quest in is when you most want to remember where it was.
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  const quest = { id: 'q_abc', title: 'Clear the vault', place: { cell: { x: 9, y: 9 } } };
  book.syncQuests([quest]);
  assert.equal(book.here().filter(m => m.kind === 'quest').length, 1);
  book.save({ cellX: 9, cellY: 9, name: 'The vault', from: { type: 'quest', id: quest.id, label: quest.title } });

  book.syncQuests([]);                       // handed in
  assert.equal(book.here().filter(m => m.kind === 'quest').length, 0, 'the quest marker should go');
  assert.equal(book.saved().length, 1, 'the place you kept must NOT go with it');
  assert.equal(book.saved()[0].from.id, 'q_abc');
});

test('saved places and stars ride the save with everything else', () => {
  const book = new MarkerBook();
  book.setWorld(world(5, 2));
  book.save({ cellX: 7, cellY: 8, name: 'The seam', note: 'iron' });
  const quest = book.add({ kind: 'quest', name: 'A job', cellX: 1, cellY: 1 });
  book.star(quest, true);

  const again = new MarkerBook(JSON.parse(JSON.stringify(book.toJSON())));
  assert.equal(again.saved().length, 1);
  assert.equal(again.saved()[0].note, 'iron');
  assert.equal(again.starred().length, 2);

  // an OLD save has no `starred` at all, and must simply come back unstarred rather than crashing
  const old = new MarkerBook({ markers: [{ id: 'm1', kind: 'pin', name: 'Old pin', cell: { x: 1, y: 1 }, systemSeed: 5, planetId: 2 }], nextId: 2, world: { systemSeed: 5, planetId: 2 } });
  assert.equal(old.starred().length, 0);
  assert.equal(old.here().length, 1);
});

test('a quest may ask for its own marker glyph, and anything that does not is still a quest', () => {
  const book = new MarkerBook();
  book.setWorld(world(1, 0));
  book.syncQuests([
    { id: 'q1', title: 'Carry word', place: { cell: { x: 2, y: 2 } } },
    { id: 'q2', title: 'Something came down', markerKind: 'fall', place: { cell: { x: 3, y: 3 } } },
    { id: 'q3', title: 'Nonsense', markerKind: 'not_a_kind', place: { cell: { x: 4, y: 4 } } },
  ]);
  const byName = Object.fromEntries(book.here().map(m => [m.name, m.kind]));
  assert.equal(byName['Carry word'], 'quest');
  assert.equal(byName['Something came down'], 'fall', 'a meteor is an impact, not an exclamation mark');
  assert.equal(byName.Nonsense, 'quest', 'an unknown kind falls back rather than drawing blank');
});
