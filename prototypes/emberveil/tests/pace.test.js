// Round 21 (E34): one speed factor paces a whole fight, and 4x is exactly today's timing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEEDS, DEFAULT_SPEED, PACE, SPEED_TIPS, normalizeSpeed, paceFactor, timeScale, paceMs, extraGap } from '../js/pace.js';

test('the three speeds, with 4x as the default', () => {
  assert.deepEqual(SPEEDS, [1, 2, 4]);
  assert.equal(DEFAULT_SPEED, 4);
  for (const s of SPEEDS) assert.ok(SPEED_TIPS[s] && SPEED_TIPS[s].length > 20, `tooltip for ${s}x`);
});

test('stored or clicked values are cleaned up; junk falls back to 4x', () => {
  assert.equal(normalizeSpeed('2'), 2);
  assert.equal(normalizeSpeed(1), 1);
  for (const bad of [undefined, null, '', 'fast', 3, 0, -4, 8, NaN]) assert.equal(normalizeSpeed(bad), 4, String(bad));
});

test('the factor: 4x → 1, 2x → 2, 1x → 4, and the frame clock is its inverse', () => {
  assert.equal(paceFactor(4), 1); assert.equal(paceFactor(2), 2); assert.equal(paceFactor(1), 4);
  assert.equal(timeScale(4), 1); assert.equal(timeScale(2), 0.5); assert.equal(timeScale(1), 0.25);
  for (const s of SPEEDS) assert.equal(paceFactor(s) * timeScale(s), 1);
});

test('at 4x nothing about the old pacing changes', () => {
  for (const [k, ms] of Object.entries(PACE)) {
    if (k === 'roundGap' || k === 'eventGap') assert.equal(extraGap(ms, 4), 0, k);
    else assert.equal(paceMs(ms, 4), ms, k);
  }
  // the numbers main.js used before round 21
  assert.equal(PACE.afterDamage, 160); assert.equal(PACE.afterSkill, 200); assert.equal(PACE.afterPhase, 220); assert.equal(PACE.attackFlash, 90); assert.equal(PACE.floatText, 1000);
});

test('slower speeds stretch every wait and add the extra beats', () => {
  assert.equal(paceMs(160, 2), 320); assert.equal(paceMs(160, 1), 640);
  assert.equal(extraGap(260, 2), 260); assert.equal(extraGap(260, 1), 780);
  // a whole round of five hits takes longer the slower the speed, in order
  const round = s => 5 * paceMs(PACE.afterDamage, s) + extraGap(PACE.roundGap, s) + 3 * extraGap(PACE.eventGap, s);
  assert.ok(round(1) > round(2) && round(2) > round(4));
  assert.equal(round(4), 800);
});
