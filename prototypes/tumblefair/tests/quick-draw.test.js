import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, planRounds, judgeRt, settleRound, soloPoints, ROUNDS, FAKES, FAKE_S, LAG_MAX, MIN_RT, TICK, FIRST, SECOND, FALSE_START, START_S, BELL_MAX_S, REVEAL_S, END_S } from '../js/games/quick-draw/sim.js';

const mk = (n, seed = 5) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const step = (g, s) => { for (let t = 0; t < s - 1e-9 && !g.over; t += 0.05) g.step(0.05); };
const until = (g, f) => { let k = 0; while (!f(g.state()) && k++ < 10000 && !g.over) g.step(0.05); };
const toBell = g => until(g, s => s.phase === 'bell');

test('the plan: bells from the seed, fakes never in the last 0.9 s before the bell, none in round 1', () => {
  for (let seed = 1; seed < 200; seed++) {
    const P = planRounds(makeRng(seed));
    assert.equal(P.length, ROUNDS); assert.equal(P[0].fakes.length, 0);
    for (const r of P) {
      assert.ok(r.wait >= 2 && r.wait <= 5);
      let prev = -9;
      for (const f of r.fakes) { assert.ok(FAKES.includes(f.k)); assert.ok(f.at + FAKE_S < r.wait - 0.1, 'a fake is gone before the bell'); assert.ok(f.at >= 0.7 && f.at - prev >= 1); prev = f.at; }
    }
  }
  const many = Array.from({ length: 50 }, (_, s) => planRounds(makeRng(s + 1)).reduce((n, r) => n + r.fakes.length, 0));
  assert.ok(many.every(n => n >= 4), 'every game has fake-outs');
});

test('judging a reaction: the phone\'s own time, kept inside what the server saw', () => {
  assert.equal(judgeRt(300, 500), 300, 'a slow line is forgiven');
  assert.equal(judgeRt(100, 1500), 1500 - LAG_MAX, 'but not by more than LAG_MAX');
  assert.equal(judgeRt(900, 400), 400 + TICK, 'no slower than the server saw it');
  assert.equal(judgeRt(undefined, 400), 400 + TICK); assert.equal(judgeRt('fast', 400), 400 + TICK); assert.equal(judgeRt(NaN, 400), 400 + TICK);
});

test('round scoring: 1st 3, 2nd 1 with 3+ players, false start -1, ties share', () => {
  let r = settleRound({ 1: 300, 2: 250, 3: 400 }, [], [1, 2, 3]);
  assert.deepEqual(r.order, [2, 1, 3]); assert.deepEqual(r.gain, { 1: SECOND, 2: FIRST, 3: 0 });
  r = settleRound({ 1: 300, 2: 250 }, [], [1, 2]); assert.deepEqual(r.gain, { 1: 0, 2: FIRST }, 'two players: only the winner scores');
  r = settleRound({ 2: 250 }, [1], [1, 2, 3]); assert.deepEqual(r.gain, { 1: FALSE_START, 2: FIRST, 3: 0 });
  r = settleRound({ 1: 250, 2: 250, 3: 300 }, [], [1, 2, 3]); assert.deepEqual(r.gain, { 1: FIRST, 2: FIRST, 3: 0 }, 'a tie for first: both first, nobody second');
  r = settleRound({ 1: 240 }, [], [1]); assert.equal(r.gain[1], 5);
  assert.deepEqual([soloPoints(200), soloPoints(300), soloPoints(400), soloPoints(500), soloPoints(800), soloPoints(1200), soloPoints(null)], [5, 4, 3, 2, 1, 0, 0]);
});

test('no clock and no hint of the bell while waiting; a tap before the bell is a false start', () => {
  const g = mk(3); until(g, s => s.phase === 'wait' && s.round === 0);
  const s = g.state(); assert.equal(s.left, undefined); assert.deepEqual(Object.keys(s).sort(), ['done', 'out', 'phase', 'round', 'scores'], 'nothing that gives the bell time away');
  g.act(1, 'tap', { r: 0, rt: 200 });
  assert.deepEqual(g.state().out, [1]);
  toBell(g);
  g.act(1, 'tap', { r: 0, rt: 200 }); assert.deepEqual(g.state().done, [], 'out for the round: a second tap does nothing');
  step(g, 0.3); g.act(2, 'tap', { r: 0, rt: 220 }); step(g, 0.1); g.act(3, 'tap', { r: 0, rt: 260 });
  until(g, s => s.phase === 'reveal');
  const r = g.state().reveal; assert.deepEqual(r.order, [2, 3]); assert.deepEqual(r.early, [1]);
  assert.deepEqual(g.state().scores, { 1: 0, 2: FIRST, 3: SECOND }, 'never below zero');
});

test('a tap the phone made before it showed the bell is a false start, even if it reaches the server after', () => {
  const g = mk(2); toBell(g); step(g, 0.2);
  g.act(1, 'tap', { r: 0, early: true }); g.act(2, 'tap', { r: 0, rt: 30 });     // 30 ms = a guess
  assert.deepEqual(g.state().out.sort(), [1, 2]);
});

test('a slow line does not lose to a fast one if its reaction was quicker', () => {
  const g = mk(2); toBell(g);
  step(g, 0.2); g.act(1, 'tap', { r: 0, rt: 190 });          // fast line, 190 ms
  step(g, 0.3); g.act(2, 'tap', { r: 0, rt: 170 });          // reached the server later, but reacted faster
  until(g, s => s.phase === 'reveal');
  assert.deepEqual(g.state().reveal.order, [2, 1]);
});

test('everyone tapped: the bell window closes early; stale and junk taps are ignored', () => {
  const g = mk(2); toBell(g);
  g.act(1, 'tap', { r: 3, rt: 200 }); g.act(1, 'tap', null); g.act(1, 'tap', 5); g.act(7, 'tap', { r: 0, rt: 200 });
  assert.deepEqual(g.state().done, []);
  step(g, 0.2); g.act(1, 'tap', { r: 0, rt: 200 }); g.act(2, 'tap', { r: 0, rt: 210 });
  step(g, 0.4); assert.equal(g.state().phase, 'reveal');
  g.act(1, 'tap', { r: 0, rt: 100 }); assert.equal(g.state().reveal.times[1], 200);
});

test('fake-outs show in the state while they last', () => {
  let seen = 0;
  for (let seed = 1; seed < 6; seed++) {
    const g = mk(1, seed);
    while (!g.over) { const s = g.state(); if (s.fake) { seen++; assert.ok(FAKES.includes(s.fake.k)); assert.equal(s.phase, 'wait'); } g.step(0.05); }
  }
  assert.ok(seen > 20);
});

test('whole games for 1-4 players end in time; the fastest wins; result shape', () => {
  for (let n = 1; n <= 4; n++) {
    const g = mk(n, 20 + n); let t = 0, belled = -1;
    while (!g.over) {
      const s = g.state();
      if (s.phase === 'bell' && belled !== s.round) { belled = s.round; step(g, 0.5); t += 0.5; for (let p = 1; p <= n; p++) g.act(p, 'tap', { r: s.round, rt: 180 + p * 40 }); }
      g.step(0.05); t += 0.05;
    }
    assert.ok(t <= meta.seconds, `${n} players: ${t.toFixed(1)} s`);
    const res = g.result(); assert.deepEqual(res.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
    assert.deepEqual(res.order[0], [1]); assert.equal(res.unit, 'points');
    if (n === 1) assert.equal(res.scores[1], ROUNDS * soloPoints(220));
    if (n >= 3) assert.equal(res.scores[2], ROUNDS * SECOND);
  }
});

test('the longest possible game still fits the clock; nobody tapping is a tie on 0', () => {
  assert.ok(START_S + ROUNDS * (5 + BELL_MAX_S + REVEAL_S) + END_S <= meta.seconds);
  const g = mk(4); step(g, meta.seconds);
  assert.ok(g.over); assert.deepEqual(g.result().order, [[1, 2, 3, 4]]);
  assert.ok(MIN_RT < 150);
});
