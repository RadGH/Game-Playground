// node --test prototypes/farhold/tests/combat-feel.test.js
//
// Round 14 — what a hit FEELS like, checked without a browser.
//
// Two things matter most here and they are both invariants rather than numbers:
//
//   1. THE CYCLE TIME DID NOT MOVE. Splitting a swing into wind-up, damage and recovery is pure
//      feel; if it changes the rate of fire it has changed the balance of the whole game by
//      accident. `wind + recover` must come OUT of the weapon's `every`, never on top of it.
//   2. A HEAVY STRIKE IS HEAVIER THAN A LIGHT ONE, on every axis at once. A slam pushes further,
//      staggers longer, holds the world longer and shakes harder than a jab — if any one of those
//      is out of order the strike table has been edited carelessly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STRIKES, WEAPON_PATTERNS, RANGED, FAMILY_WIND, profileOf, strikeAt, swingTiming,
  drawPower, chargeAt, STAFF_CHARGE, traitsOf, clipFor, CLIP_SECONDS, familyWind,
} from '../js/weapons.js';
import { createFeel, staggerFor, pushFor, STAGGER_FALLOFF } from '../js/combat-feel.js';

const KEYS = Object.keys(STRIKES);

test('every strike shape carries its physics, and all of it is finite and sane', () => {
  for (const key of KEYS) {
    const s = STRIKES[key];
    for (const field of ['reach', 'arc', 'damage', 'wind', 'splash', 'push', 'stagger', 'hitstop', 'shake', 'pen', 'step']) {
      assert.equal(typeof s[field], 'number', `${key} is missing ${field}`);
      assert.ok(Number.isFinite(s[field]), `${key}.${field} is not a number`);
      assert.ok(s[field] >= 0, `${key}.${field} is negative`);
    }
    assert.ok(s.hitstop <= 260, `${key} would hold the world still for ${s.hitstop} ms`);
    assert.ok(s.push <= 2.5, `${key} would throw a body ${s.push} m`);
    assert.ok(s.stagger <= 0.8, `${key} would remove ${s.stagger}s of a fight`);
    assert.ok(s.pen <= 0.6, `${key} ignores ${s.pen * 100}% of armour`);
    assert.ok(s.glyph && s.name, `${key} has nothing to draw on a card`);
  }
});

test('a slam is heavier than a jab on every axis there is', () => {
  const heavy = STRIKES.slam, light = STRIKES.jab;
  for (const field of ['damage', 'wind', 'push', 'stagger', 'hitstop', 'shake', 'splash']) {
    assert.ok(heavy[field] > light[field], `a slam should out-${field} a jab`);
  }
  // …and the order holds all the way down the table
  assert.ok(STRIKES.overhead.push > STRIKES.slash.push);
  assert.ok(STRIKES.slash.push > STRIKES.jab.push);
  assert.ok(STRIKES.slam.hitstop > STRIKES.overhead.hitstop);
});

test('the three new shapes are what they were written to be', () => {
  // arc: the sword finisher — wide, and it carries you into it
  assert.ok(STRIKES.arc.arc > STRIKES.slash.arc * 2, 'the arc cut should hit everything in front of you');
  assert.ok(STRIKES.arc.step > 0, 'the arc cut should carry you forward');
  // slam: the smash
  assert.ok(STRIKES.slam.push >= 2, 'a slam should knock something properly back');
  assert.ok(STRIKES.slam.stagger >= 0.6, 'a slam should buy you time');
  // lunge: the gap closer that goes through armour
  assert.ok(STRIKES.lunge.step > STRIKES.thrust.step, 'a lunge should cover more ground than a thrust');
  assert.ok(STRIKES.lunge.pen > STRIKES.thrust.pen, 'a lunge should go further through armour');
  assert.ok(STRIKES.lunge.reach > STRIKES.thrust.reach, 'a lunge should out-reach a thrust');
});

test('THE INVARIANT: splitting a swing in three does not change how fast you swing', () => {
  for (const [key, row] of Object.entries(WEAPON_PATTERNS)) {
    const item = { type: 'weapon', baseKey: key, weaponCategory: 'heavy', twoHanded: /2h|great|halberd|quarterstaff|bow/.test(key) };
    let sum = 0;
    for (let i = 0; i < row.pattern.length; i++) {
      const t = swingTiming(item, i);
      // the whole cycle is the weapon's own clock, untouched
      assert.ok(Math.abs(t.every - strikeAt(item, i).every) < 1e-9, `${key} step ${i}: the cycle time moved`);
      // …and the wind-up and the recovery fit inside it with room to spare
      assert.ok(t.wind + t.recover <= t.every * 0.901,
        `${key} step ${i}: ${Math.round(t.windMs + t.recoverMs)} ms of swing inside a ${Math.round(t.every * 1000)} ms cycle`);
      assert.ok(t.wind >= 0 && t.recover >= 0);
      sum += t.every;
    }
    assert.ok(sum > 0, `${key} has no clock at all`);
  }
});

test('a heavier family winds up for longer, and haste speeds the whole swing up together', () => {
  const dagger = { type: 'weapon', baseKey: 'dagger', weaponCategory: 'light' };
  const greatsword = { type: 'weapon', baseKey: 'greatsword', weaponCategory: 'heavy', twoHanded: true };
  assert.ok(familyWind(greatsword) > familyWind(dagger) * 3, 'a greatsword should be a decision');
  assert.ok(FAMILY_WIND.hammer > FAMILY_WIND.sword);
  assert.ok(FAMILY_WIND.dagger < FAMILY_WIND.rapier);

  const slow = swingTiming(greatsword, 1, 1);
  const fast = swingTiming(greatsword, 1, 0.5);
  assert.ok(fast.wind < slow.wind, 'haste should shorten the wind-up');
  assert.ok(Math.abs(fast.wind / slow.wind - 0.5) < 0.02, 'haste should shorten it in proportion');
});

test('stagger has diminishing returns, so a maul cannot lock a boss for ever', () => {
  const body = {};
  const first = staggerFor(body, 0.65, 0);
  const second = staggerFor(body, 0.65, 1);
  const third = staggerFor(body, 0.65, 2);
  const fourth = staggerFor(body, 0.65, 3);
  assert.equal(first, 0.65);
  assert.ok(second < first && third < second);
  assert.equal(fourth, 0, 'the fourth stagger inside the window should be nothing at all');
  assert.ok(first + second + third + fourth < first * 3, 'four staggers must be worth less than three');
  // …and the book forgets once you stop landing them
  assert.equal(staggerFor(body, 0.65, 20), 0.65);
  assert.deepEqual(STAGGER_FALLOFF, [1, 0.6, 0.3, 0]);
});

test('knockback is resisted by rank, and a hovering body has nothing to brace against', () => {
  assert.equal(pushFor({ rank: 'normal' }, 2), 2);
  assert.ok(pushFor({ rank: 'champion' }, 2) < 2);
  assert.ok(pushFor({ rank: 'rare' }, 2) < pushFor({ rank: 'champion' }, 2));
  assert.ok(pushFor({ boss: true }, 2) < pushFor({ rank: 'rare' }, 2));
  assert.ok(pushFor({ rank: 'normal', hover: 1.2 }, 2) > 2);
  assert.equal(pushFor(null, 2), 0);
});

test('hit-stop holds the world, ramps back to full speed, and one is never stacked on another', () => {
  const feel = createFeel();
  assert.equal(feel.scale, 1);
  feel.hit({ strike: STRIKES.slam, toX: 3, toZ: 0 });
  assert.ok(feel.scale < 0.2, 'the world should nearly stop on a smash');
  // a jab landing mid-smash must not shorten it
  feel.hit({ strike: STRIKES.jab, toX: 1, toZ: 0 });
  assert.ok(feel.scale < 0.2);
  feel.advance(0.5);
  assert.equal(feel.scale, 1, 'it must always come back');
  // a kill is worth more than a hit, and nothing is worth more than the cap
  feel.reset();
  feel.hit({ strike: STRIKES.slam, killed: true, toX: 1, toZ: 1 });
  feel.advance(0.20);
  assert.ok(feel.scale < 1, 'a killing blow should hold longer than an ordinary hit');
  feel.advance(0.07);
  assert.equal(feel.scale, 1, 'a hit-stop must never last longer than the 260 ms cap');
});

test('hit-stop and shake are both a switch, and turning them off changes nothing else', () => {
  const feel = createFeel();
  feel.setEnabled({ hitStop: false, screenShake: false });
  feel.hit({ strike: STRIKES.slam, toX: 3, toZ: 0 });
  assert.equal(feel.scale, 1, 'with impact freeze off the world must not stop');
  const [x, y, z] = feel.cameraOffset();
  assert.equal(x + y + z, 0, 'with screen shake off the camera must not move');
});

test('the camera is knocked the way the blow went, and never further than the cap', () => {
  const feel = createFeel();
  feel.hit({ strike: STRIKES.slam, fromX: 0, fromZ: 0, toX: 10, toZ: 0 });
  assert.ok(feel.shakeAmount > 0 && feel.shakeAmount <= 0.12);
  let moved = false;
  for (let i = 0; i < 12; i++) {
    feel.advance(1 / 60);
    const o = feel.cameraOffset();
    if (Math.abs(o[0]) > 1e-6) moved = true;
    assert.ok(Math.hypot(o[0], o[1], o[2]) <= 0.13, 'the shake went past its ceiling');
  }
  assert.ok(moved, 'the camera never moved at all');
  feel.advance(0.5);
  assert.deepEqual(feel.cameraOffset(), [0, 0, 0], 'the shake must settle');
});

test('a bow has a draw, and letting go too early is a refusal rather than a weak shot', () => {
  const bow = RANGED.bow;
  assert.equal(drawPower(bow, 0.2).ready, false, 'you have not nocked yet');
  assert.equal(drawPower(bow, 0.36).ready, true);
  assert.ok(drawPower(bow, 0.95).power > drawPower(bow, 0.4).power * 2, 'a full draw must be worth waiting for');
  assert.ok(Math.abs(drawPower(bow, 0.95).power - bow.powerFull) < 0.01);
  // …and holding it for ever starts to cost you
  assert.ok(drawPower(bow, 4).power < drawPower(bow, 1.0).power, 'the arms should start to shake');
  // a crossbow does not scale: one heavy bolt
  assert.equal(drawPower(RANGED.crossbow, 0).power, RANGED.crossbow.power);
  assert.ok(RANGED.crossbow.reload > 1, 'a crossbow should leave you defenceless for a moment');
});

test('a staff charges: a tap is free and weak, a full channel is much bigger and costs mana', () => {
  const tap = chargeAt(0.1);
  const half = chargeAt(STAFF_CHARGE.full);
  const full = chargeAt(STAFF_CHARGE.max);
  assert.equal(tap.tap, true);
  assert.equal(tap.mana, 0, 'a tap must be free');
  assert.ok(tap.power < half.power && half.power < full.power);
  assert.ok(tap.radius < half.radius && half.radius < full.radius);
  assert.ok(Math.abs(full.radius / half.radius - 2) < 0.01, 'a full charge should be twice the radius');
  assert.ok(full.mana > 0, 'channelling must cost something');
  assert.ok(chargeAt(9).power <= full.power, 'holding past the top must not keep growing');
});

test('every strike shape has a clip, and a two-hander never plays a one-handed cut', () => {
  for (const key of KEYS) {
    const one = clipFor(key, { twoHanded: false });
    const two = clipFor(key, { twoHanded: true });
    assert.ok(one && two, `${key} has no clip`);
    assert.ok(CLIP_SECONDS[one] > 0, `${one} has no length`);
    assert.ok(CLIP_SECONDS[two] > 0, `${two} has no length`);
  }
  // a one-handed slash alternates, so a combo reads as a combo
  assert.notEqual(clipFor('slash', { step: 0 }), clipFor('slash', { step: 1 }));
  assert.equal(clipFor('slash', { twoHanded: true }), 'sweep');
  assert.equal(clipFor('slam'), 'slam');
  assert.equal(clipFor('shot'), 'shoot');
});

test('the swing channel carries the shape, the weapon and its element', () => {
  const feel = createFeel();
  const item = { type: 'weapon', baseKey: 'sword', weaponCategory: 'heavy', castElement: 'fire' };
  feel.postSwing({ ...STRIKES.slash, item });
  assert.equal(feel.swing.strike.key, 'slash');
  assert.equal(feel.swing.weapon, item);
  assert.equal(feel.swing.element, 'fire', 'a branded weapon should paint its arc in its own colour');
  feel.postSwing({ ...STRIKES.slam, item: { type: 'weapon', baseKey: 'hammer' } });
  assert.equal(feel.swing.element, 'physical');
});
