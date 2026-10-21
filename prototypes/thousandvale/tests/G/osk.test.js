// Play-test 12 (#68): the on-screen keyboard's cursor — the left column must be reachable, moves wrap, and up/down
// land under the same spot. Pure (oskStep / OSK_ROWS), no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSK_ROWS, oskStep, oskCentres } from '../../js/client/input/osk.js';

const walk = (at, moves) => moves.reduce((s, [dx, dy]) => oskStep(OSK_ROWS, s, dx, dy), at);

test('#68: one step left from column 1 lands on column 0 (it used to wrap to the far end)', () => {
  for (let r = 0; r < OSK_ROWS.length; r++) {
    const s = oskStep(OSK_ROWS, { r, c: 1 }, -1, 0);
    assert.equal(s.c, 0, `row ${r}`);
  }
});
test('every key of every row is reachable from the start by left OR right', () => {
  for (let r = 0; r < OSK_ROWS.length; r++) {
    const n = OSK_ROWS[r].length;
    const seenL = new Set(), seenR = new Set(); let a = { r, c: 0 }, b = { r, c: 0 };
    for (let i = 0; i < n; i++) { seenL.add(a.c); seenR.add(b.c); a = oskStep(OSK_ROWS, a, -1, 0); b = oskStep(OSK_ROWS, b, 1, 0); }
    assert.equal(seenL.size, n); assert.equal(seenR.size, n);
  }
});
test('left from column 0 wraps to the end, right from the end wraps to 0', () => {
  const n = OSK_ROWS[1].length;
  assert.equal(oskStep(OSK_ROWS, { r: 1, c: 0 }, -1, 0).c, n - 1);
  assert.equal(oskStep(OSK_ROWS, { r: 1, c: n - 1 }, 1, 0).c, 0);
});
test('up/down keep the column under the same spot and wrap top <-> bottom', () => {
  const q = { r: 1, c: 0 };
  assert.deepEqual([oskStep(OSK_ROWS, q, 0, -1).r, oskStep(OSK_ROWS, q, 0, -1).c], [0, 0]);      // q -> 1
  const down3 = walk(q, [[0, 1], [0, 1]]);                                                    // q -> a -> shift
  assert.equal(OSK_ROWS[down3.r][down3.c].k, 'shift');
  const bottom = walk({ r: 0, c: 0 }, [[0, -1]]);
  assert.equal(bottom.r, OSK_ROWS.length - 1);
  // passing over the wide space bar and back up does not drift sideways
  const there = walk({ r: 3, c: 5 }, [[0, 1], [0, -1]]);
  assert.deepEqual([there.r, there.c], [3, 5]);
});
test('the board has its own delete, capitals, space and send keys', () => {
  const kinds = OSK_ROWS.flat().map(k => k.k);
  for (const k of ['back', 'shift', 'space', 'done']) assert.ok(kinds.includes(k), k);
  for (const row of OSK_ROWS) { const c = oskCentres(row); assert.ok(c.every((x, i) => x > 0 && x < 1 && (!i || x > c[i - 1]))); }
});
