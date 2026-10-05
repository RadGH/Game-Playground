// Play-test 1, P14 (stream A): "two waystones both named Barrow Entrance a few feet apart". E places a door
// waystone ~42 m off every dungeon door and buildLayout added its own when none stood within 40 m — so every
// dungeon had two. Now: no door stone of ours within WAYSTONE_DOOR_M, stones closer than WAYSTONE_DEDUPE_M merge
// (a character who found the dropped one keeps the kept one), and door stones carry the dungeon's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeWaystones, WAYSTONE_DOOR_M, WAYSTONE_DEDUPE_M } from '../../js/sim/realm.js';
import { realContent } from './pt1-helpers.js';

test('P14: a placed door stone 42 m off the door and a generated one beside it become one, named for the dungeon', () => {
  assert.ok(WAYSTONE_DOOR_M > 42 + 10, 'the door test reaches E\'s stones');
  const doors = [{ x: 100, z: 100, name: 'Barrow entrance', sheet: { name: 'Hollin Pass', dungeon: { name: 'The Windlass Spire' } } }];
  const ws = [
    { key: 'ws:z1_door', name: 'Barrow entrance', x: 142, z: 100 },          // E's
    { key: 'ws:town', name: 'Torborhold', x: 900, z: 900, town: 0 },
    { key: 'ws:p:d0', name: 'Barrow entrance', x: 106, z: 104, door: 0 },    // the old generated one
  ];
  const aliases = dedupeWaystones(ws, doors);
  assert.equal(ws.length, 2);
  assert.deepEqual(aliases, { 'ws:p:d0': 'ws:z1_door' });
  assert.equal(ws[0].name, 'The Windlass Spire');
  assert.equal(ws[1].name, 'Torborhold', 'a town stone keeps its name');
});

test('P14: the real province has no two waystones within WAYSTONE_DEDUPE_M and no repeated names', async () => {
  const C = await realContent();
  const W = C.layouts[0].waystones;
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
    const d = Math.hypot(W[i].x - W[j].x, W[i].z - W[j].z);
    assert.ok(d >= WAYSTONE_DEDUPE_M, `${W[i].key} "${W[i].name}" and ${W[j].key} "${W[j].name}" are ${d.toFixed(1)} m apart`);
  }
  const names = new Map();
  for (const w of W) names.set(w.name, (names.get(w.name) || 0) + 1);
  const twice = [...names].filter(([, n]) => n > 1);
  assert.deepEqual(twice, [], 'every stone in the travel list has its own name');
});
