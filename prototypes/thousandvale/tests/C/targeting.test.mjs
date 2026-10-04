// node --test prototypes/thousandvale/tests/C/targeting.test.mjs — Tab targeting (js/rules/targeting.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTarget, tabOrder, validTarget } from '../../js/rules/targeting.js';

const me = { id: 1, x: 0, z: 0, yaw: 0, team: 1 };
const foe = (id, x, z, extra = {}) => ({ id, x, z, team: 2, ...extra });

test('Tab picks the nearest enemy in front first, then cycles through everything in range and wraps', () => {
  const list = [me, foe(2, 0, 10), foe(3, 0, 4), foe(4, 0, -3), foe(5, 0, 60), { id: 6, x: 1, z: 1, team: 1 }, foe(7, 2, 2, { dead: true })];
  assert.deepEqual(tabOrder(list, me).map(t => t.id), [3, 2, 4], 'front by distance, then behind; far, dead and friends left out');
  let cur = null;
  const seen = [];
  for (let i = 0; i < 4; i++) { cur = nextTarget(list, me, { current: cur })?.id; seen.push(cur); }
  assert.deepEqual(seen, [3, 2, 4, 3]);
});

test('friendly Tab (for heals) lists party members, never enemies', () => {
  const list = [me, foe(2, 0, 3), { id: 6, x: 1, z: 1, team: 1 }, { id: 8, x: 0, z: 9, team: 1 }];
  assert.deepEqual(tabOrder(list, me, { hostile: false }).map(t => t.id), [6, 8]);
});

test('a named target must be alive and in range', () => {
  assert.ok(validTarget(me, foe(2, 0, 10)));
  assert.ok(!validTarget(me, foe(2, 0, 50)));
  assert.ok(!validTarget(me, foe(2, 0, 5, { dead: true })));
  assert.ok(!validTarget(me, { id: 6, x: 1, z: 1, team: 1 }, { hostile: true }));
});
