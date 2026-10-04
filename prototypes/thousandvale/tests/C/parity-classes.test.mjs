// node --test prototypes/thousandvale/tests/C/parity-classes.test.mjs
//
// M2 PARITY: ALL THIRTY Farhold classes through the cast pipeline. For each class, every skill on its
// bar (R28 rows, talents as the bar resolves them), each after that class's own basic attack, with
// monsters, placed objects, pools, channels, echoes, afterimages and delayed strikes all running —
// Farhold's real skill bar + runtime + EnemyField on one side, Thousandvale on the other, compared
// every frame (tests/C/parity-kit.mjs). Two seeds per class.
//
// The follower system runs on both sides (js/rules/followers.js vs Farhold's pets.js + followers.js
// gate): class companions from the first frame, summons, temporary summons, decoys, shape forms,
// songs, stances and tempers — every follower's health, place and statuses compared every frame too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBar } from './parity-kit.mjs';

const CLASSES = JSON.parse(readFileSync(new URL('../../../farhold/data/classes.json', import.meta.url), 'utf8')).classes.map(c => c.id);
const SKILLS = JSON.parse(readFileSync(new URL('../../../farhold/data/skills.json', import.meta.url), 'utf8'));
export const NEEDS_FOLLOWERS = row => !!row.form || (row.shape === 'summon' && !row.summon?.temporary);

for (let i = 0; i < CLASSES.length; i += 6) {
  const batch = CLASSES.slice(i, i + 6);
  test(`classes ${i + 1}-${i + batch.length} (${batch.join(', ')}): every skill lands the same in Farhold and Thousandvale`, async t => {
    for (const classId of batch) {
      for (const seed of [4, 17]) {
        const r = await runBar({ classId, seed, followers: true });
        assert.deepEqual(r.problems, [], `${classId} seed ${seed}`);
        assert.equal(r.casts, (SKILLS.classes[classId] || []).length, `${classId}: every skill on the bar was compared`);
        if (seed === 4) t.diagnostic(`${classId}: ${r.casts} skills, ${Math.round(r.dealt)} damage, identical`);
      }
    }
  });
}

test('every skill of every class is covered — nothing waits on the follower system any more', () => {
  let n = 0;
  for (const c of CLASSES) n += (SKILLS.classes[c] || []).length;
  assert.equal(n, 180);
});
