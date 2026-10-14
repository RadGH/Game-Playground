import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, settleRound, validSplit, COINS, ROUNDS, START_S, PICK_S, REVEAL_S, END_S, FORECASTS, GUST } from '../js/games/coinstorm/sim.js';

const mk = (n, seed = 4) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPick = g => { const r = g.state().round; while (!(g.state().phase === 'pick' && g.state().round > r)) g.step(0.05); };
const toReveal = g => { while (g.state().phase !== 'reveal') g.step(0.05); return g.state().reveal; };

test('the rules, one round at a time', () => {
  // the biggest windmill pile blows away, the others double; sunshine triples the cloud
  let r = settleRound({ 1: [5, 5, 0], 2: [7, 3, 0], 3: [0, 0, 10] }, true);
  assert.equal(r.top, 5); assert.deepEqual(r.blown, [1]); assert.deepEqual(r.gain, { 1: 5, 2: 7 + 6, 3: 30 });
  // a storm loses the cloud; a tie for the biggest pile blows both away
  r = settleRound({ 1: [6, 4, 0], 2: [2, 4, 4], 3: [8, 2, 0] }, false);
  assert.deepEqual(r.blown, [1, 2]); assert.deepEqual(r.gain, { 1: 6, 2: 2, 3: 8 + 4 });
  // nobody on the windmill: nothing blows away
  r = settleRound({ 1: [10, 0, 0], 2: [10, 0, 0] }, false); assert.deepEqual(r.blown, []); assert.deepEqual(r.gain, { 1: 10, 2: 10 });
  // solo: the Gust's pile competes but wins nothing
  r = settleRound({ 1: [7, 3, 0] }, true, [5]); assert.deepEqual(r.blown, []); assert.equal(r.gain[1], 13);
  r = settleRound({ 1: [5, 5, 0] }, true, [5]); assert.deepEqual(r.blown, [1], 'a tie with the Gust blows yours away too');
  assert.ok(validSplit([10, 0, 0]) && validSplit([0, 3, 7]));
  for (const d of [[9, 0, 0], [11, -1, 0], [5, 5], [5, 2.5, 2.5], ['10', 0, 0], null, 10, [4, 3, 3, 0]]) assert.equal(validSplit(d), false, JSON.stringify(d));
});

test('everyone starts each round with 10 coins in the bank; a split is private until the reveal', () => {
  const g = mk(3); toPick(g);
  assert.deepEqual(g.priv(1).split, [COINS, 0, 0]);
  g.act(1, 'set', [1, 2, 7]);
  assert.deepEqual(g.priv(1).split, [1, 2, 7]);
  assert.ok(!JSON.stringify(g.state()).includes('[1,2,7]') && g.state().reveal === undefined, 'nothing about it in the public state');
  assert.ok(FORECASTS.includes(g.state().f));
  const rv = toReveal(g); assert.deepEqual(rv.alloc[1], [1, 2, 7]); assert.deepEqual(rv.alloc[2], [COINS, 0, 0]);
  toPick(g); assert.deepEqual(g.priv(1).split, [COINS, 0, 0], 'fresh coins next round');
});

test('the storm outcome follows the seed, is the same for everyone, and is hidden until the reveal', () => {
  let sun = 0, storm = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = mk(2, seed), h = mk(2, seed);
    toPick(g); toPick(h); assert.equal(g.state().f, h.state().f);
    assert.equal(JSON.stringify(g.state()).includes('sun"'), false);
    g.act(1, 'set', [0, 0, 10]); const r = toReveal(g); r.sun ? sun++ : storm++;
    assert.equal(r.gain[1], r.sun ? 30 : 0);
  }
  assert.ok(sun > 5 && storm > 5, `${sun} sunny, ${storm} stormy`);
});

test('lock in: everyone locked skips the wait; changing the split unlocks you', () => {
  const g = mk(2); toPick(g);
  g.act(1, 'lock', true); assert.equal(g.priv(1).locked, true);
  g.act(1, 'set', [5, 5, 0]); assert.equal(g.priv(1).locked, false, 'changed your mind: unlocked');
  g.act(1, 'lock', true); g.act(2, 'lock', true); run(g, 0.7);
  assert.equal(g.state().phase, 'reveal');
});

test('invalid acts are refused', () => {
  const g = mk(2); g.act(1, 'set', [0, 5, 5]); assert.equal(g.priv(1).split, null, 'not before the first round');
  toPick(g);
  for (const d of [[9, 0, 0], [0, 0, 11], [3, 3, 3.5], '10,0,0', null, { 0: 10 }, [10, 0, -0.5]]) g.act(1, 'set', d);
  for (const d of ['yes', 1, null]) g.act(1, 'lock', d);
  g.act(1, 'hide', [0, 0, 10]); g.act(7, 'set', [0, 0, 10]);
  assert.deepEqual(g.priv(1).split, [COINS, 0, 0]); assert.equal(g.priv(1).locked, false);
  toReveal(g); g.act(1, 'set', [0, 0, 10]); assert.deepEqual(g.state().reveal.alloc[1], [COINS, 0, 0], 'too late once revealed');
});

test('no input at all: five rounds, everyone banks 10 a round, tied, ends inside meta.seconds', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 40 + n), rounds = new Set();
    for (let t = 0; t < meta.seconds && !g.over; t += 0.05) { g.step(0.05); if (g.state().phase === 'reveal') rounds.add(g.state().round); }
    assert.ok(g.over, `${n} players: ends by itself`); assert.equal(rounds.size, ROUNDS);
    const r = g.result(); assert.deepEqual(r.order, [Array.from({ length: n }, (_, i) => i + 1)]);
    assert.ok(Object.values(r.scores).every(v => v === COINS * ROUNDS)); assert.equal(r.unit, 'coins');
  }
  assert.ok(START_S + ROUNDS * (PICK_S + REVEAL_S) + END_S + 2 <= meta.seconds);
});

test('a running total over five rounds; a greedy windmill loses to a modest one; ties share a place', () => {
  const g = mk(3, 8);
  for (let r = 0; r < ROUNDS; r++) { toPick(g); g.act(1, 'set', [0, 10, 0]); g.act(2, 'set', [6, 4, 0]); g.act(3, 'set', [6, 4, 0]); toReveal(g); }
  run(g, END_S + REVEAL_S + 1); assert.ok(g.over);
  const res = g.result();
  assert.deepEqual(res.scores, { 1: 0, 2: 14 * ROUNDS, 3: 14 * ROUNDS });
  assert.deepEqual(res.order, [[2, 3], [1]]);
});

test('solo: the Gust is in the reveal, within its range, and the game still pays out', () => {
  const g = mk(1, 3); toPick(g); g.act(1, 'set', [9, 1, 0]); const r = toReveal(g);
  assert.ok(r.gust >= GUST[0] && r.gust <= GUST[1]);
  assert.equal(r.gain[1], 9 + (r.gust >= 1 ? 2 : 0) - (r.gust === 1 ? 2 : 0));
  run(g, meta.seconds); assert.ok(g.over); assert.deepEqual(g.result().order, [[1]]);
  assert.equal(mk(2).init().solo, false); assert.equal(mk(2, 3).state().reveal, undefined);
});

test('state only changes when something changes and stays small', () => {
  const g = mk(4); toPick(g);
  const s0 = JSON.stringify(g.state()); g.step(0.05); assert.equal(JSON.stringify(g.state()), s0);
  assert.ok(s0.length < 200, s0.length);
  for (const p of [1, 2, 3, 4]) g.act(p, 'set', [2, 4, 4]);
  toReveal(g); assert.ok(JSON.stringify(g.state()).length < 600);
});
