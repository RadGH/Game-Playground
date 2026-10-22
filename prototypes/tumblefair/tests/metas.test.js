// js/games/metas.js (what the browser loads) must say exactly what the games' own sim.js files say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metasSource } from '../tools/build-metas.mjs';

test('metas.js is up to date (run tools/build-metas.mjs)', () => {
  assert.equal(readFileSync(new URL('../js/games/metas.js', import.meta.url), 'utf8'), metasSource());
});
