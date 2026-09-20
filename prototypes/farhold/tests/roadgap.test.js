// node --test prototypes/farhold/tests/roadgap.test.js
//
// "At this location the road stops and starts again with a gap in the middle: seed 14343310,
// Baus-Beinen II, biome Rainforest, x 9720, z 16259, altitude 11."
//
// The road point nearest that spot carried `wet: true` while standing on 3.1 m of dry land, with dry
// points either side and no water within thirty metres. `buildRibbons` breaks the road ribbon at
// every wet point — those are meant to be sea lanes — and it skips the point itself, so one stray
// flag cut the road in two and left a hole where the join should be. Measured on that world: one wet
// point near the player, and it was the stray; zero real sea-lane points.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../js/features.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('a lone wet flag cannot break the road ribbon', () => {
  assert.match(code, /const wetAt = i =>/, 'the ribbon has no tolerance for a stray wet flag');
  // it must accept a flag only when a NEIGHBOUR agrees…
  assert.match(code, /r\.wet\[i - 1\] \|\| r\.wet\[i \+ 1\]/,
    'a wet point must be part of a run to count');
  // …or when the ground under it really is water now
  assert.match(code, /terrain\.waterAt\(wx, wz\)/,
    'a wet point must be rechecked against the terrain, which the deck grading can change under it');
});

test('the ribbon loop asks wetAt, not the raw flag', () => {
  // easy to undo by accident: the old line read `const wet = i > b || r.wet?.[i];`
  const loop = code.slice(code.indexOf('let runStart = a;'), code.indexOf('runStart = i + 1;'));
  assert.match(loop, /wetAt\(i\)/, 'the loop went back to reading the raw flag');
  assert.ok(!/r\.wet\?\.\[i\]/.test(loop), 'the loop is reading the raw flag again');
});

test('a real sea lane is still broken out of the road', () => {
  // the tolerance must not go so far that a genuine crossing gets paved over the ocean
  assert.match(code, /push\(road, ribbon\(/, 'the ribbon is no longer being split into runs');
  assert.match(src, /sea lanes/i, 'the reason the split exists is no longer written down');
});
