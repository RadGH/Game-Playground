// node --test prototypes/farhold/tests/upper-air.test.js
//
// The upper atmosphere's NUMBERS. The behaviour is a page test (it needs a terrain); these are the
// knobs, and they exist because the first version of this regime made the climb to space take 75
// seconds where it used to take 19 — a change nobody asked for, hidden inside a feature that was
// asked for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../js/atmos.js'), 'utf8');

/** Pull a number out of the DEFAULTS block, so the test reads what the game reads. */
function knob(name) {
  const m = src.match(new RegExp(`^\\s*${name}:\\s*([0-9.]+)`, 'm'));
  assert.ok(m, `no knob called ${name}`);
  return Number(m[1]);
}

test('the ceiling is somewhere you can actually reach', () => {
  const ceiling = knob('ceiling');
  // 46,000 m was the first attempt and it put space more than a minute away on a full-size world
  assert.ok(ceiling <= 24000, `a ${ceiling} m ceiling is a commute, not a climb`);
  assert.ok(ceiling >= 12000, 'and it has to leave room for a band worth flying in');
});

test('the band is a real part of the climb, not a line near the top', () => {
  const from = knob('highFrom');
  assert.ok(from > 0.1 && from < 0.45,
    `the upper atmosphere starts at ${from} of the ceiling — that is either the whole sky or none of it`);
});

test('the commanded climb rate gets FASTER with altitude, never slower', () => {
  // the original bug: the rate was a speed limit, so crossing into the band dragged a 510 m/s climb
  // down toward 260 and the ship got slower the higher it went
  assert.ok(knob('climbRateTop') > 1, 'the top of the band must be quicker than the bottom');
  assert.ok(knob('thinSpeed') > 0, 'the airframe speed cap has to relax where there is no air');
});

test('asking to climb can only ever ADD to a climb already in progress', () => {
  // this is the shape of the fix, and it is easy to undo by accident
  assert.match(src, /Math\.max\(state\.velocity\.y, wanted\)/,
    'the climb branch must take the faster of thrust and the commanded rate');
  assert.match(src, /Math\.min\(state\.velocity\.y, wanted\)/,
    'and the descend branch the faster descent');
});

test('letting go holds the altitude, with damping so it does not bounce', () => {
  assert.ok(knob('holdGain') > 0, 'nothing pulls it back to the held altitude');
  assert.ok(knob('holdDamp') > 0, 'and nothing stops it oscillating around it');
});

test('leaving the atmosphere is deliberate, not a line you drift over', () => {
  assert.ok(knob('exitHold') > 0.5, 'a ship coasting upward should not be ejected from the world');
  assert.match(src, /state\.exiting/, 'the hold has to be tracked');
});

test('entering and leaving the band is announced, because the controls change meaning', () => {
  assert.match(src, /Upper atmosphere\./);
  assert.match(src, /Back into thick air/);
});

test('a caller with no input object is steered by the throttle', () => {
  // The launch cinematic, the debug menu and the page tests all drive this model directly: they set
  // `state.throttle` and pass no input, because that is how it worked before there was a rate
  // control. Reading only `input.forward` treated them as "nobody is asking", and the hold-station
  // spring then pinned a ship under full power at four kilometres, fighting its own engines. It
  // could not reach space at all.
  assert.match(src, /input \? \(input\.forward \?\? 0\) : \(state\.throttle \?\? 0\)/,
    'the ask must fall back to the throttle when no input object was handed in');
  // …and both the climb branch and the exit check need it, not just one of them
  const uses = src.match(/input \? \(input\.forward \?\? 0\) : \(state\.throttle \?\? 0\)/g) || [];
  assert.ok(uses.length >= 2, `only ${uses.length} of the two places fall back`);
});

test('once the exit is earned it latches, so it cannot depend on who is calling', () => {
  // main.js steps the model once a frame with the real input; the tests and the debug menu step it
  // with their own. The moment two callers disagreed about whether the pilot was asking, the counter
  // reset and a ship that had earned its exit sat above the ceiling for ever.
  assert.match(src, /state\.readyToLeave = true/, 'nothing latches the exit');
  assert.match(src, /out\.leftAtmosphere = !!state\.readyToLeave/, 'the flag must read the latch');
  assert.match(src, /state\.y < cfg\.ceiling \* 0\.95.*readyToLeave = false/s,
    'and coming back down into the air must close it again');
});
