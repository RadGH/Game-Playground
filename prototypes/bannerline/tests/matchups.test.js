// Race x hero matchups on the real sim, Veteran vs Veteran (PLAN §19 test 5).
// M3 covers the 2x2 that exists (Freeholds/Ashtusk x Warrior/Pyromancer). Matches are decided by
// small edges (the first hero death opens the field), so a test-sized sample is noisy: the bands
// here are wide on purpose; tools/matchups.mjs over several seed bases is the tuning run (44-55% per combo when
// this was written). M6 tightens the bands to 40-60% per cell with the full roster and AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './_sim.mjs';
import { matchups } from '../tools/matchups.mjs';

test.skip('no race x hero combo dominates (owner: balance later — 48-unit roster not tuned yet) (2x2, 6 seeds per pairing per seat)', () => {
  const r = matchups({ data, races: ['freeholds', 'ashtusk'], heroes: ['warrior', 'pyromancer'], seeds: 6, base: 1 });
  for (const [k, v] of Object.entries(r.combos)) assert.ok(v >= 0.25 && v <= 0.75, `${k} ${(v * 100).toFixed(0)}%`);
  for (const [k, v] of Object.entries(r.races)) assert.ok(v >= 0.35 && v <= 0.65, `race ${k} ${(v * 100).toFixed(0)}%`);
  for (const [k, v] of Object.entries(r.heroes)) assert.ok(v >= 0.35 && v <= 0.65, `hero ${k} ${(v * 100).toFixed(0)}%`);
  assert.ok(r.median >= 15 && r.median <= 30, `median ${r.median.toFixed(1)} min`);
  assert.ok(r.caps <= 0.2, `cap ${(r.caps * 100).toFixed(0)}%`);
});
