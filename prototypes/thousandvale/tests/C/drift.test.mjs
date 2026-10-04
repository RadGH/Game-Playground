// node --test prototypes/thousandvale/tests/C/drift.test.mjs
//
// The DRIFT GUARD. Thousandvale forks the orchestration of a fight out of Farhold's main.js and
// actors.js (they cannot be imported: Three.js, the HUD, an 11,000-line closure). Each block it
// mirrors is hashed here; when Farhold edits one, this goes red and names the Thousandvale file to
// re-port. Then: read the Farhold diff, port it, run the parity fixtures, and paste the new hash.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIFT, block, hash } from './farhold-oracle.mjs';

/** Hashes as last ported (2026-10-04, Farhold R28). */
const PORTED = {
  'main.js swingWith (melee branch)': '9b151257966ecf0c',
  'main.js onEnemyStrike': 'b1bafac5cac64aa5',
  'main.js castSkill': '4de37349845bf2f0',
  'main.js landStatus': '36b2d98d19662ab0',
  'main.js onEnemyKilled': 'b4e3a5cf5d24bfe2',
  'actors.js EnemyField.update': '59bbfcb81ba839a6',
  'actors.js strike/strikeArea/strikeSegment/land': '890a4d0b5becbd35',
  'actors.js add': '083a91f79fbc1f5a',
  'actors.js spread/shove/slide': 'da77860a7597e155',
};

test('every mirrored Farhold block is found and unchanged since it was ported', () => {
  const now = {};
  for (const d of DRIFT) {
    const text = block(d.file, d.start, d.end);
    assert.ok(text, `${d.name}: could not find the block in farhold/js/${d.file} — Farhold restructured it; re-port ${d.mirror}`);
    now[d.name] = hash(text);
  }
  const changed = DRIFT.filter(d => PORTED[d.name] && PORTED[d.name] !== now[d.name]);
  const unset = DRIFT.filter(d => !PORTED[d.name]);
  if (unset.length) console.log('drift hashes to record:\n' + unset.map(d => `  '${d.name}': '${now[d.name]}',`).join('\n'));
  assert.equal(unset.length, 0, 'record the hashes above in PORTED');
  assert.deepEqual(changed.map(d => `${d.name} -> re-port ${d.mirror}`), [], 'Farhold changed a block Thousandvale mirrors');
});
