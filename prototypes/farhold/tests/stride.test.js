// node --test prototypes/farhold/tests/stride.test.js
//
// "Can you make the character walking animation fixed? He doesn't walk, but my minions do."
//
// The legs were moving the whole time — the bones swing 0.7 rad and the mesh is properly skinned to
// them. The fault was that a walk cycle is a fixed 1.05 seconds while the body covers 5.4 metres in
// that second: a 2.7 metre stride on a character a metre and a bit tall. The feet skated, and a
// model gliding with its knees moving does not read as walking.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, '../js/main.js'), 'utf8');
const chibi = readFileSync(join(here, '../../../avatar-3d/js/chibi2.js'), 'utf8');
const motion = readFileSync(join(here, '../../../avatar-3d/js/chibi2-motion.js'), 'utf8');
const balance = JSON.parse(readFileSync(join(here, '../data/balance.json'), 'utf8'));

test('the rig can be played at a rate, and the rate is clamped', () => {
  assert.match(chibi, /setRate\(k\)/, 'the chibi rig has no playback rate');
  assert.match(chibi, /asset\.mixer\.update\(d \* rate\)/, 'the rate is not applied to the mixer');
  // a clamp, or a sprint becomes a blur and a crawl stops dead
  const m = chibi.match(/setRate\(k\)\s*\{[^}]*Math\.max\(([\d.]+),\s*Math\.min\(([\d.]+)/);
  assert.ok(m, 'setRate does not clamp');
  assert.ok(Number(m[1]) > 0 && Number(m[2]) <= 6);
});

test('main.js drives the rate from the speed the body is actually moving at', () => {
  assert.match(main, /actor\.setRate/, 'nothing sets the stride rate');
  assert.match(main, /control\.moving \* cycle/, 'the rate must come from the ground speed');
});

test('the cycle lengths the wiring assumes are the ones the clips actually have', () => {
  // the numbers in main.js are quoted from chibi2-motion.js; if that table changes the stride goes
  // wrong again, silently, and the feet start skating for a reason nobody will think to look for
  const lengths = motion.match(/const LENGTHS = \{([^}]*)\}/)[1];
  const walk = Number(lengths.match(/walk:\s*([\d.]+)/)[1]);
  const run = Number(lengths.match(/run:\s*([\d.]+)/)[1]);
  assert.match(main, new RegExp(`control\\.running \\? ${run} : ${walk}`),
    `main.js assumes different clip lengths than chibi2-motion.js (walk ${walk}, run ${run})`);
});

test('a walking stride is shorter than a running one, and both are plausible for the body', () => {
  const m = main.match(/const STRIDE = control\.running \? ([\d.]+) : ([\d.]+)/);
  assert.ok(m, 'no stride length');
  const [run, walk] = [Number(m[1]), Number(m[2])];
  assert.ok(run > walk, 'a run should cover more ground per cycle than a walk');
  // the chibi is a bit over a metre tall; a 2.7 m walking stride was the bug
  assert.ok(walk <= 2.4, `a ${walk} m walking stride is a leap, not a step`);
});

test('the speeds this has to cover are the ones the game actually uses', () => {
  const p = balance.player || {};
  const walk = p.moveSpeed ?? 5.4;
  const run = walk * (p.runMultiplier ?? 2.1);
  const m = main.match(/const STRIDE = control\.running \? ([\d.]+) : ([\d.]+)/);
  const rateWalk = (walk * 1.05) / Number(m[2]);
  const rateRun = (run * 0.65) / Number(m[1]);
  // both have to land inside the rig's clamp, or the stride silently stops matching
  for (const [what, r] of [['walk', rateWalk], ['run', rateRun]]) {
    assert.ok(r >= 0.15 && r <= 3.5, `${what} wants a ${r.toFixed(2)}x rate, outside the rig's clamp`);
  }
});
