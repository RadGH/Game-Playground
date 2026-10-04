import test from 'node:test';
import assert from 'node:assert/strict';
import { tabOrder, tabNext } from '../../js/net/tab.js';

const mirror = { ents: new Map([
  [1, { id: 1, kind: 'player', x: 0, z: 0, hp: 1, state: 0 }],
  [2, { id: 2, kind: 'monster', x: 0, z: 10, hp: 1, state: 0 }],        // in front, 10 m
  [3, { id: 3, kind: 'monster', x: 0, z: 5, hp: 1, state: 0 }],         // in front, 5 m
  [4, { id: 4, kind: 'monster', x: 0, z: -3, hp: 1, state: 0 }],        // behind, 3 m
  [5, { id: 5, kind: 'monster', x: 0, z: 2, hp: 0, state: 1 }],         // dead
  [6, { id: 6, kind: 'object', x: 1, z: 1, hp: 1, state: 0 }],          // a door
  [7, { id: 7, kind: 'monster', x: 0, z: 90, hp: 1, state: 0 }],        // too far
]) };
const me = { id: 1, x: 0, z: 0, yaw: 0 };   // facing +z

test('tab order: in front first, nearest first, no dead/objects/far', () => {
  assert.deepEqual(tabOrder(mirror, me), [3, 2, 4]);
  assert.equal(tabNext(mirror, me, 0), 3);
  assert.equal(tabNext(mirror, me, 3), 2);
  assert.equal(tabNext(mirror, me, 4), 3, 'wraps');
  assert.equal(tabNext({ ents: new Map() }, me, 0), 0);
});
