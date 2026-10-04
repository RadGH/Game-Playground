// node --test prototypes/thousandvale/tests/C/parity-classes.test.mjs
//
// M2 PARITY: ALL THIRTY Farhold classes through the cast pipeline. For each class, every skill on its
// bar (R28 rows, talents as the bar resolves them), each after that class's own basic attack, with
// monsters, placed objects, pools, channels, echoes, afterimages and delayed strikes all running —
// Farhold's real skill bar + runtime + EnemyField on one side, Thousandvale on the other, compared
// every frame (tests/C/parity-kit.mjs). Two seeds per class.
//
// Left out on BOTH sides until the follower system lands (and listed by the last test so the gap is
// visible): permanent summons and shape forms.

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
        const r = await runBar({ classId, seed, skip: NEEDS_FOLLOWERS });
        assert.deepEqual(r.problems, [], `${classId} seed ${seed}`);
        const expected = (SKILLS.classes[classId] || []).filter(id => SKILLS.skills[id] && !NEEDS_FOLLOWERS(SKILLS.skills[id])).length;
        assert.equal(r.casts, expected, `${classId}: every skill that needs no follower was compared`);
        if (seed === 4) t.diagnostic(`${classId}: ${r.casts} skills, ${Math.round(r.dealt)} damage, identical`);
      }
    }
  });
}

test('the skills still waiting on the follower system (summons, shape forms) — the visible gap', t => {
  const waiting = [];
  for (const c of CLASSES) for (const id of SKILLS.classes[c] || []) if (SKILLS.skills[id] && NEEDS_FOLLOWERS(SKILLS.skills[id])) waiting.push(`${c}/${id}`);
  t.diagnostic(`${waiting.length} skills need followers: ${waiting.join(' ')}`);
  assert.ok(waiting.length < 40);
});
