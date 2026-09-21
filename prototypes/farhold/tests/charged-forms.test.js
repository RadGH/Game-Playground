// R15 — the six charged forms, which were written down and unreachable.
//
//   "staves are lacking their magical appeal, find a way to improve all of these"
//
// `CHARGED_FORMS` and `chargedForm()` have been exported from js/weapons.js since round 14 and were
// called by NOBODY: six forms in a table, zero of them in the game. So a full charge was the same
// spell at 1.6x damage and 2x radius — a fine weapon, and not a second spell.
//
// This file is the source test that stops that happening again, plus the arithmetic on the table
// itself. The branches live in main.js, which imports Three.js and will not load under `node --test`
// — so what can be checked here is that every form in the table is DISPATCHED somewhere, which is
// exactly the thing that was wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARGED_FORMS, chargedForm, chargeAt, STAFF_CHARGE } from '../js/weapons.js';

const MAIN = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

test('every charged form in the table is dispatched by name in the game', () => {
  const shapes = [...new Set(Object.values(CHARGED_FORMS).map(f => f.shape))];
  assert.ok(shapes.length >= 5, `only ${shapes.length} distinct forms`);
  for (const shape of shapes) {
    assert.match(MAIN, new RegExp(`charged[?]?[.]shape === '${shape}'`),
      `nothing in main.js ever acts on the "${shape}" form — it is a row in a table and nothing else`);
  }
});

test('`chargedForm` is actually called, which it was not for a whole round', () => {
  assert.match(MAIN, /chargedForm\(/, 'chargedForm is exported and nobody calls it');
  // …and only on a real charge. A tap has to stay the ordinary spell or a staff needs holding to use.
  assert.match(MAIN, /charge\.tap/, 'a quick tap is not distinguished from a held charge');
});

test('a tap is the plain spell and a held charge is the other one', () => {
  const c = STAFF_CHARGE;
  const tap = chargeAt(0.05, c);
  assert.equal(tap.tap, true, 'a quick press already counts as a charge');
  const full = chargeAt(c.full, c);
  assert.equal(full.tap, false);
  assert.ok(full.power > tap.power && full.radius > tap.radius);
});

test('every form says what it is, and the four that change the spell say how much', () => {
  for (const [from, f] of Object.entries(CHARGED_FORMS)) {
    assert.ok(f.shape, `${from} becomes nothing`);
    assert.ok(f.name, `${from} has no name`);
    assert.ok(f.note && f.note.length > 12, `${from} does not say what it does`);
    assert.notEqual(f.shape, from, `${from} "becomes" itself, which is not a different kind of thing`);
  }
  // the numbers the branches read have to be there, or the branch silently falls back
  assert.ok(CHARGED_FORMS.cone.ticks > 1, 'the jet is one tick, which is a cone');
  assert.ok(CHARGED_FORMS.nova.push > 0, 'the dome shoves nothing');
  assert.ok(CHARGED_FORMS.wave.seconds > 0, 'the wall stands for no time');
  assert.ok(CHARGED_FORMS.ground.seconds > CHARGED_FORMS.wave.seconds, 'a poisoned field is no longer-lasting than a wall');
  assert.ok(CHARGED_FORMS.chain.chains > 3, 'the storm jumps no further than the plain chain');
});

test('a shape with no entry still gets an answer rather than null', () => {
  const made = chargedForm({ shape: 'somethingnew' });
  assert.ok(made, 'an unknown shape returns nothing and the branch would crash');
  assert.equal(made.shape, 'somethingnew', 'it should simply fire bigger');
  assert.ok(made.note);
  assert.equal(chargedForm(null), null);
});

test('the dome shoves through the same field a hammer does', () => {
  // writing a position instead would push things through walls — the push has to be `e.push`, which
  // actors.js travels over 0.18 s and resists by rank
  assert.match(MAIN, /enemy\.push = \{/, 'the dome does not use the knockback field');
  assert.match(MAIN, /pushFor\(enemy/, 'the dome ignores rank resistance, so a boss flies');
});

test('the wall reuses the lingering-ground pool rather than a second mechanism', () => {
  const wall = MAIN.slice(MAIN.indexOf("charged.shape === 'wall'"), MAIN.indexOf("charged.shape === 'wall'") + 1200);
  assert.match(wall, /dropPool\(/, 'the wall invents its own lingering ground');
});
