// node --test prototypes/farhold/tests/round26-dungeon.test.js
//
// Round 26 — "I got a quest 'Clear the Mauran Undercroft' and I went to the location and there is a
// big rock thing there that looks like maybe a cave entrance. However despite the yellow arrow
// pointing to it, I cannot interact with it in any way. I was expecting a dungeon."
//
// Two faults, one after the other:
//
//   1. js/sites.js builds a beast den ON the dungeon mouth — the "big rock thing" — and the den's
//      earth bank is a solid disc about 7 m across its middle. `E` asked for the mouth within 4.5 m
//      of its centre, which is inside the bank: you could walk all the way round and never be
//      close enough. The reach is now counted from the edge of whatever covers the mouth
//      (`ObstacleField.coverAt`, read by js/dungeon.js `nearest`).
//   2. Even once inside, the job could not finish: js/main.js called `questLog.onClear?.(…)` when
//      the boss went down, and QuestLog had no `onClear` — the `?.` swallowed it.
//
// tests/round26-fixes.spec.js walks up to real mouths in a browser; this file holds the pure rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ObstacleField } from '../js/collide.js';
import { makeQuest, QuestLog } from '../js/quests.js';

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, '../js/main.js'), 'utf8');
const dungeonSrc = readFileSync(join(here, '../js/dungeon.js'), 'utf8');

/** js/dungeon.js `nearest`, restated with the same arithmetic (the module imports three.js). */
function nearestMouth(mouths, x, z, range, blockers) {
  let best = null, bestGap = Infinity;
  for (const n of mouths) {
    let cover = 0;
    for (const f of blockers) cover = Math.max(cover, f.coverAt(n.x, n.z));
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < range + cover && d - cover < bestGap) { bestGap = d - cover; best = n; }
  }
  return best;
}

test('coverAt: how far from a point the nearest standable ground is', () => {
  const f = new ObstacleField();
  f.add(100, 100, 7.2, 5);             // a den's bank, centred on the mouth
  f.add(130, 100, 0.8, 4);             // a door post off to one side
  assert.equal(f.coverAt(100, 100), 7.2);
  assert.ok(Math.abs(f.coverAt(102, 100) - 5.2) < 1e-9);
  assert.equal(f.coverAt(120, 100), 0, 'open ground is covered by nothing');
  // a deck is walked on, never "over" a point
  f.addDeck(200, 200, 0, 10, 3, 5);
  assert.equal(f.coverAt(200, 200), 0);
});

test('a mouth under a den can be reached from the den\'s edge, from every side', () => {
  const sites = new ObstacleField();
  const mouth = { id: 1, x: 500, z: 500, name: 'the Mauran Undercroft' };
  sites.add(mouth.x, mouth.z, 7.2, 5);
  const body = 0.4;                                   // the player's own collision radius
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    // as close as the collider lets you stand
    const d = 7.2 + body + 0.05;
    const x = mouth.x + Math.sin(a) * d, z = mouth.z + Math.cos(a) * d;
    assert.equal(sites.blocked(x, z, body), false, 'the test put the player inside the bank');
    assert.equal(nearestMouth([mouth], x, z, 4.5, []), null, 'the old rule would have reached it — the test is not testing the bug');
    assert.equal(nearestMouth([mouth], x, z, 4.5, [sites]), mouth, `no door from bearing ${a.toFixed(2)}`);
  }
  // and it is still a door you have to walk up to, not one you can open from across a field
  assert.equal(nearestMouth([mouth], mouth.x + 7.2 + 5, mouth.z, 4.5, [sites]), null);
});

test('js/main.js hands the fields that build over a mouth to gates.nearest', () => {
  assert.match(main, /gates\.nearest\(control\.x, control\.z, 4\.5, \[siteSolids/);
  assert.match(dungeonSrc, /nearest: \(x, z, range = 4\.5, blockers = null\)/);
});

function clearJob() {
  let s = 7;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const enemies = [{ id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 10 }];
  const nodes = [{ id: 42, type: 'dungeon', name: 'The Mauran Undercroft', x: 10, y: 12 }];
  const q = makeQuest('clear', { rng, level: 1, giver: { id: 1, name: 'Ada' }, enemies, nodes, at: { x: 0, z: 0 } });
  // the onboarding hook may take the first job a giver hands out; ask again if it did
  return q?.kind === 'clear' ? q : makeQuest('clear', { rng, level: 1, giver: { id: 1, name: 'Ada' }, enemies, nodes, at: { x: 0, z: 0 } });
}

test('clearing the place a clear job names finishes the job (onClear exists now)', () => {
  const log = new QuestLog();
  const q = clearJob();
  assert.equal(q.kind, 'clear');
  assert.match(q.title, /Mauran Undercroft/);
  log.add(q);
  assert.equal(typeof log.onClear, 'function', 'main.js calls questLog.onClear — it has to exist');
  // somewhere else entirely: nothing happens
  assert.deepEqual(log.onClear({ name: 'Somewhere Else', x: q.place.x + 5000, z: q.place.z }), []);
  assert.equal(q.done, false);
  // the boss of this place goes down
  const done = log.onClear({ name: 'The Mauran Undercroft', x: q.place.x + 3, z: q.place.z - 2 });
  assert.deepEqual(done.map(j => j.id), [q.id]);
  assert.equal(q.done, true);
  assert.equal(q.progress, q.count);
});

test('js/main.js stocks a dungeon with what an open clear job there still wants', () => {
  // the job's target was never guaranteed to spawn inside; the rooms came from the biome's pool
  assert.match(main, /q\.kind !== 'clear' \|\| !q\.place\) continue;[\s\S]{0,400}bestiary\.enemies\.find\(d => d\.id === q\.target\)/);
  assert.match(main, /questLog\.onClear\?\.\(\{ name: dungeon\.name, x: node\?\.x, z: node\?\.z \}\)/);
});
