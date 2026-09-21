// node --test prototypes/farhold/tests/round17-map.test.js
//
// Round 17 — the map, the markers and the waypoints. Four of the six items in this round's list are
// rules rather than pictures, so they are testable without a browser:
//
//   item 9  — "if I hover directly over it it says something about 'ancient wood'… There is only a
//              few pixels at the top-left of the icon that give me the correct World Boss tooltip."
//   item 11 — "marking a resource on the map shouldn't necessarily favorite the location."
//   item 19 — "…uncheck those to keep them favorited but hide them from the map/world."
//   item 20 — "This one should not be removable unless you destroy the building."
//
// The resolver (js/map-hits.js) and the marker book (js/markers.js) are pure, so these drive the
// code the game runs rather than a re-statement of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickHit, markHitRadius } from '../js/map-hits.js';
import { MAP_MARKS, MARK_ORDER } from '../js/map.js';
import { MarkerBook, MARKER_LOOKS } from '../js/markers.js';
import { syncOutpostMarkers, renameOutpostMarker } from '../js/outposts.js';
import { createWaypoints } from '../js/waypoints.js';

const world = { systemSeed: 4242, planetId: 2, planetName: 'Kerreth', starName: 'A Star' };

/**
 * The hit list js/map.js builds, at the radii it builds it with.
 *
 * `drawPlaces()` sorts smallest-last (`MARK_ORDER` descending) so a capital is never hidden under
 * the hamlet beside it, and pushes in that order — which is the arrangement that produced the bug.
 * Reproducing it here rather than inventing a tidy list is the point: a resolver that only works on
 * a list somebody sorted for it is not a fix.
 */
function placeHits(marks, { k = 1.2, dpr = 2 } = {}) {
  const order = new Map(MARK_ORDER.map((key, i) => [key, i]));
  const painted = [...marks].sort((a, b) => (order.get(b.key) ?? 0) - (order.get(a.key) ?? 0));
  return painted.map((m, i) => ({
    tier: 'place', key: m.key, x: m.x, y: m.y,
    r: markHitRadius(MAP_MARKS[m.key], k, dpr),
    order: i,
  }));
}

// ---------------------------------------------------------------- item 9: what is under the pointer

test('item 9 — the icon under your pointer is the one you are pointing at, not the one beneath it', () => {
  /**
   * The reported case, to scale. A world boss burst (r 6.0, with a ring, so 6.0 x 1.2 x 1.55 = 11.2
   * buffer pixels of drawn radius) with an ancient wood (r 3.6) fourteen pixels up and to the left
   * of it — close enough that the wood's hit circle covers most of the burst.
   */
  const hits = placeHits([
    { key: 'ancientwood', x: 486, y: 486 },
    { key: 'worldboss', x: 500, y: 500 },
  ]);

  // the middle of the boss — the exact pixel the report says gives the wrong answer
  assert.equal(pickHit(hits, 500, 500).key, 'worldboss', 'the centre of the boss answered as something else');
  // …and a few pixels around it, in every direction, not only the top-left sliver
  for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0], [3, 3], [-3, 3]]) {
    assert.equal(pickHit(hits, 500 + dx, 500 + dy).key, 'worldboss', `(${dx},${dy}) off centre lost the boss`);
  }
  // and the wood still answers for itself
  assert.equal(pickHit(hits, 486, 486).key, 'ancientwood');
  // nothing at all twelve hundred pixels away
  assert.equal(pickHit(hits, 1700, 1700), null);
});

test('item 9 — every icon kind answers at its own visual centre', () => {
  /**
   * The bug was not specific to a world boss; it was specific to being drawn on top. So every kind
   * in the table is laid out in a row, each with its LOWEST-priority neighbour overlapping it, and
   * each has to win its own middle.
   */
  const kinds = Object.keys(MAP_MARKS);
  const marks = kinds.map((key, i) => ({ key, x: 100 + i * 30, y: 200 }));
  // a plain landmark pip on top of every one of them — the "surrounding" in the report
  for (let i = 0; i < kinds.length; i++) marks.push({ key: 'landmark', x: 100 + i * 30 + 6, y: 206 });
  const hits = placeHits(marks);

  for (let i = 0; i < kinds.length; i++) {
    const key = kinds[i];
    if (key === 'landmark') continue;          // it is the thing doing the covering
    const got = pickHit(hits, 100 + i * 30, 200);
    assert.ok(got, `${key} answered nothing at its own centre`);
    assert.equal(got.key, key, `${key}'s centre answered as ${got.key}`);
  }
});

test('item 9 — a hit target is the same size whatever the display', () => {
  /**
   * `Math.max(9, r * k + 4)` was nine BACKING-BUFFER pixels, and the buffer is twice the CSS size on
   * a retina screen — so the floor that was there to make a 3 px pip clickable was four and a half
   * real pixels, and every target on the map silently changed size with the machine.
   */
  const pip = MAP_MARKS.landmark;
  assert.equal(markHitRadius(pip, 1, 2), markHitRadius(pip, 1, 1) * 2,
    'the hit radius did not scale with the backing buffer');
  // a capital's ring is part of what you can see, so it is part of what you can point at
  assert.ok(markHitRadius(MAP_MARKS.capital, 1.5, 1) > markHitRadius(MAP_MARKS.town, 1.5, 1),
    'a capital is not a bigger target than a town');
});

test('item 9 — a marker beats the place it was dropped on, and both beat the ground', () => {
  // markers are painted after places, so a pin dropped on a village answers for itself
  const hits = [
    { tier: 'place', key: 'village', x: 300, y: 300, r: 12, order: 0 },
    { tier: 'pad', key: 'pad:3', x: 300, y: 300, r: 12, order: 1 },
    { tier: 'marker', key: 'm:7', x: 300, y: 300, r: 12, order: 2 },
  ];
  assert.equal(pickHit(hits, 300, 300).key, 'm:7');
  // …and the click handler, which only ever wants a pad, still finds one under all of that
  assert.equal(pickHit(hits, 300, 300, 'pad').key, 'pad:3');
  assert.equal(pickHit(hits, 300, 300, 'place').key, 'village');
});

// ---------------------------------------------------------------- item 11: tracked vs favorited

test('item 11 — tracking a deposit does not favorite it, and favoriting one does not untrack it', () => {
  const book = new MarkerBook();
  book.setWorld(world);

  const seam = book.trackResource({ id: 'node-14', name: 'Copper Ore', cellX: 40, cellY: 22, colour: '#c08a3e' });
  assert.equal(seam.kind, 'seam');
  assert.equal(seam.starred, undefined, 'tracking a resource quietly favorited it');
  assert.deepEqual(book.resourceTracks().map(m => m.name), ['Copper Ore']);
  assert.deepEqual(book.starred(), [], 'a tracked deposit turned up in Favorites');

  // favouriting it stars the marker that is already there rather than laying a second one on top
  const kept = book.save({ cellX: 40, cellY: 22, name: 'Copper Ore' });
  assert.equal(kept, seam, 'favoriting made a SECOND marker on the same ground');
  assert.equal(book.here().length, 1, 'one place, one marker');
  assert.equal(book.starred().length, 1);
  assert.equal(book.resourceTracks().length, 1, 'favoriting it stopped it being tracked');

  // un-starring leaves it tracked — the two are independent in both directions
  book.star(kept, false);
  assert.deepEqual(book.starred(), []);
  assert.equal(book.resourceTracks().length, 1);

  // …and untracking removes it entirely, favourite or not
  book.untrackResource(kept);
  assert.equal(book.resourceTracks().length, 0);
  assert.equal(book.here().length, 0);
});

test('item 11 — tracking the same deposit twice is one row, matched by node id or by cell', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const a = book.trackResource({ id: 'n1', name: 'Clay', cellX: 10, cellY: 10 });
  const b = book.trackResource({ id: 'n1', name: 'Clay bank', cellX: 11, cellY: 10 });
  assert.equal(a, b, 'the same node id made two tracked rows');
  assert.equal(a.name, 'Clay bank', 'a re-track should carry the better name');
  // no id at all: the cell is the identity
  const c = book.trackResource({ name: 'Clay', cellX: 10, cellY: 10 });
  assert.equal(c, a);
  assert.equal(book.resourceTracks().length, 1);
});

test('item 11 — Favorites is every starred marker, whatever kind put it there', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const pin = book.drop(5, 5, 'the ford');
  const seam = book.trackResource({ id: 'n2', name: 'Iron', cellX: 60, cellY: 60 });
  const place = book.save({ cellX: 90, cellY: 12, name: 'Clay bank' });   // starred by default
  book.star(pin, true);
  book.star(seam, true);
  assert.deepEqual(book.starred().map(m => m.name).sort(), ['Clay bank', 'Iron', 'the ford']);
  // and Places stays clean: the deposit is in Find, not in the list of somewhere to visit
  const places = book.here().filter(m => m.kind !== 'seam');
  assert.deepEqual(places.map(m => m.name).sort(), ['Clay bank', 'the ford']);
  assert.equal(place.kind, 'saved');
});

// ---------------------------------------------------------------- item 19: the two switches

test('item 19 — a favorite can be hidden from the map and from the world, separately', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const m = book.save({ cellX: 20, cellY: 30, name: 'The ford' });
  assert.equal(m.showOnMap, true);
  assert.equal(m.showInWorld, true);
  assert.deepEqual(book.onMap(), [m]);
  assert.deepEqual(book.inWorld(), [m]);

  book.show(m, 'showOnMap', false);
  assert.deepEqual(book.onMap(), [], 'a marker hidden from the map is still being drawn on it');
  assert.deepEqual(book.inWorld(), [m], 'hiding it from the map also hid it in the world');
  assert.equal(m.starred, true, 'hiding it un-favorited it');

  book.show(m, 'showInWorld', false);
  assert.deepEqual(book.inWorld(), []);
  // and back again, from the same call with no argument
  book.show(m, 'showOnMap');
  assert.deepEqual(book.onMap(), [m]);
  // a switch that does not exist changes nothing
  assert.equal(book.show(m, 'showOnMinimap', false), false);
});

test('item 19 — the minimap draws what is tracked OR favorited, minus what you switched off', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const quest = book.add({ kind: 'quest', name: 'Carry word', cellX: 1, cellY: 1 });   // tracked
  const fav = book.save({ cellX: 2, cellY: 2, name: 'Clay bank' });                    // starred, untracked
  const plain = book.add({ kind: 'pin', name: 'nothing special', cellX: 3, cellY: 3, tracked: false });

  assert.deepEqual(book.minimap().map(m => m.name).sort(), ['Carry word', 'Clay bank'],
    'a favorite did not reach the minimap, which is the whole of item 19');
  assert.ok(!book.minimap().includes(plain));

  // switching it off the map takes it off the minimap too — that is what "not distracting" means
  book.show(fav, 'showOnMap', false);
  assert.deepEqual(book.minimap().map(m => m.name), ['Carry word']);
  assert.equal(fav.starred, true, 'it stopped being a favorite when it was hidden');
  assert.equal(quest.tracked, true);
});

test('item 19 — the switches and the favorites survive a save and a load', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const fav = book.save({ cellX: 20, cellY: 30, name: 'The ford' });
  const seam = book.trackResource({ id: 'n9', name: 'Copper Ore', cellX: 44, cellY: 12 });
  book.show(fav, 'showInWorld', false);
  book.show(seam, 'showOnMap', false);
  book.star(seam, true);

  const again = new MarkerBook(JSON.parse(JSON.stringify(book.toJSON())));
  const ford = again.here().find(m => m.name === 'The ford');
  const ore = again.here().find(m => m.name === 'Copper Ore');
  assert.equal(ford.starred, true);
  assert.equal(ford.showInWorld, false, 'a hidden-in-world marker came back visible');
  assert.equal(ford.showOnMap, true);
  assert.equal(ore.showOnMap, false);
  assert.equal(ore.starred, true);
  assert.deepEqual(again.resourceTracks().map(m => m.name), ['Copper Ore'],
    'the tracked deposits did not survive the save');
});

test('item 19 — a marker out of an older save reads as visible, not as switched off', () => {
  /**
   * The trap this guards: `showOnMap` does not exist in any save written before this round, and an
   * absent flag must read as ON. Getting this backwards would blank every marker in every existing
   * run in one patch.
   */
  const old = {
    nextId: 3, world,
    markers: [{ id: 'm1', kind: 'saved', name: 'The ford', cell: { x: 4, y: 4 }, starred: true, tracked: false, ...world }],
  };
  const book = new MarkerBook(old);
  const m = book.here()[0];
  assert.equal(m.showOnMap, true);
  assert.equal(m.showInWorld, true);
  assert.equal(m.locked, false);
  assert.deepEqual(book.onMap(), [m]);
});

// ---------------------------------------------------------------- item 20: the outpost marker

const post = (id, name, x, z, role = 'mine') => ({ id, name, x, z, role, count: 3 });

test('item 20 — an outpost puts a marker on the map by itself', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const made = syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });
  assert.equal(made.length, 1);
  const m = made[0];
  assert.equal(m.kind, 'outpost');
  assert.equal(m.name, 'Mine 3');
  assert.deepEqual(m.cell, { x: 10, y: 20 });
  assert.equal(m.locked, true);
  assert.equal(m.tracked, false, 'an outpost should not seize the minimap arrow');
  assert.ok(MARKER_LOOKS.outpost.icon, 'the outpost kind has no glyph to draw');

  // running again does not make a second one
  syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });
  assert.equal(book.here().filter(x => x.kind === 'outpost').length, 1);
});

test('item 20 — the marker cannot be deleted while the outpost stands, and goes when it does not', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const [m] = syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });

  assert.equal(book.canRemove(m), false, 'the list would have drawn a delete button');
  assert.equal(book.remove(m), false, 'the player deleted an outpost marker');
  assert.equal(book.here().length, 1, 'it went anyway');

  // knock the buildings down: the ledger stops mentioning it, and the marker goes with it
  syncOutpostMarkers(book, [], { metresPerCell: 640 });
  assert.equal(book.here().length, 0, 'the marker outlived the outpost');
});

test('item 20 — you can rename it, and the next sync does not write the old name back', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const [m] = syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });
  renameOutpostMarker(book, m, '  Ironrest  ');
  assert.equal(m.name, 'Ironrest', 'the name was not trimmed');

  // the ledger still calls it "Mine 3", and the sync runs on every draw
  syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });
  assert.equal(m.name, 'Ironrest', 'a sync wrote the generated name back over the one you typed');

  // an empty rename is not a rename
  renameOutpostMarker(book, m, '   ');
  assert.equal(m.name, 'Ironrest');

  // moving the buildings moves the marker, without touching the name
  syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400 + 1280, 12800)], { metresPerCell: 640 });
  assert.deepEqual(m.cell, { x: 12, y: 20 });
  assert.equal(m.name, 'Ironrest');
});

test('item 20 — the outpost marker honours the two switches and rides the save', () => {
  const book = new MarkerBook();
  book.setWorld(world);
  const [m] = syncOutpostMarkers(book, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });
  renameOutpostMarker(book, m, 'Ironrest');
  book.show(m, 'showInWorld', false);

  const again = new MarkerBook(JSON.parse(JSON.stringify(book.toJSON())));
  const back = again.here()[0];
  assert.equal(back.name, 'Ironrest');
  assert.equal(back.locked, true, 'the lock did not survive the save — the × would come back');
  assert.equal(back.showInWorld, false);
  assert.deepEqual(again.inWorld(), []);
  assert.deepEqual(again.onMap(), [back]);
  // and the sync still recognises it as the same outpost after a load
  syncOutpostMarkers(again, [post('op1', 'Mine 3', 6400, 12800)], { metresPerCell: 640 });
  assert.equal(again.here().length, 1);
  assert.equal(again.here()[0].name, 'Ironrest');
});

// ---------------------------------------------------------------- item 19, the other half: pads

test('item 19 — a waypoint pad can be starred, hidden, and comes back after a load', () => {
  const settlements = [
    { id: 0, name: 'Hollowcrown', size: 4, wx: 1200, wz: 800 },
    { id: 1, name: 'Ashfen', size: 2, wx: 4400, wz: 2600 },
  ];
  const net = createWaypoints({ settlements, seed: 3 });
  net.visit(settlements[0]);
  net.visit(settlements[1]);

  assert.deepEqual(net.minimapPads(), [], 'an unstarred pad was on the minimap');
  net.star(0, true);
  assert.deepEqual(net.minimapPads().map(p => p.name), ['Hollowcrown'],
    'a starred waypoint did not reach the minimap, which is what item 19 reported');
  assert.equal(net.minimapPads()[0].kind, 'waypoint', 'the minimap has no look to draw it with');
  assert.equal(net.isStarred(0), true);
  assert.equal(net.isStarred(1), false);

  // hide it from the map: still a favourite, off both small map and big one
  net.show(0, 'showOnMap', false);
  assert.deepEqual(net.minimapPads(), []);
  assert.equal(net.isStarred(0), true);
  assert.equal(net.list().find(p => p.id === 0).showOnMap, false);
  // …and the world is its own switch
  assert.deepEqual(net.worldPads().map(p => p.name), ['Hollowcrown']);
  net.show(0, 'showInWorld', false);
  assert.deepEqual(net.worldPads(), []);

  /**
   * A settlement id is a NUMBER and the first settlement on a world is 0 — the fault that cost this
   * project a round when `if (padPick)` dropped the pad nearest the middle of the map. Pad 0 is
   * deliberately the one starred above, and it has to survive the save as a string key.
   */
  const back = createWaypoints({ settlements, seed: 3 });
  back.load(JSON.parse(JSON.stringify(net.toJSON())));
  assert.equal(back.isStarred(0), true, 'pad 0 lost its star across a save');
  assert.equal(back.shown(0, 'showOnMap'), false);
  assert.equal(back.shown(1, 'showOnMap'), true, 'a pad nobody touched came back hidden');
  assert.equal(back.isLit(0), true);
});
