import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makePuzzle, rivals, decode, KEYS, FEATURES, ROUNDS, LEVELS, SIZES_N, POINTS, START_S, ROUND_S, REVEAL_S } from '../js/games/pattern-impostor/sim.js';

const mk = (n, seed = 4) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPlay = g => { const r = g.state().round; while (!(g.state().phase === 'play' && g.state().round > r)) g.step(0.05); };
/** Learn the answers by playing the same seed once with nobody tapping. */
function answers(n, seed) { const g = mk(n, seed), a = []; while (!g.over) { g.step(0.05); const s = g.state(); if (s.phase === 'reveal' && a.length === s.round) a.push(s.odd); } return a; }
const tally = (items, k) => { const m = new Map(); for (const it of items) m.set(it[k], (m.get(it[k]) || 0) + 1); return m; };

test('every puzzle is fair: exactly one picture breaks the rule, no second answer, subtle rounds look ordinary (many seeds)', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const rng = makeRng(seed);
    LEVELS.forEach((lv, r) => {
      const p = makePuzzle(rng, lv, SIZES_N[r]), items = p.items.map(decode);
      assert.equal(items.length, SIZES_N[r]);
      for (const it of items) for (const k of KEYS) assert.ok(it[k] >= 0 && it[k] < FEATURES[k].length);
      assert.deepEqual(rivals(items, p.odd), [], `seed ${seed} round ${r + 1}: no other picture stands out`);
      const others = items.filter((_, i) => i !== p.odd), odd = items[p.odd];
      if (p.rule.kind === 'same') {
        const k = p.rule.a; assert.equal(new Set(others.map(it => it[k])).size, 1, 'the rest agree'); assert.notEqual(odd[k], others[0][k]);
      } else {
        const { a, b } = p.rule, map = new Map();
        for (const it of others) { if (map.has(it[a])) assert.equal(map.get(it[a]), it[b], 'the pairing holds for the rest'); map.set(it[a], it[b]); }
        assert.notEqual(map.get(odd[a]), odd[b], 'and the impostor breaks it');
        for (const k of KEYS) assert.ok(tally(items, k).get(odd[k]) >= 2, 'the impostor is ordinary on each feature alone');
      }
      assert.ok(p.text.length > 10 && p.why.length > 5);
      assert.doesNotMatch(p.text + p.why, /undefined|NaN/);
    });
  }
});

test('same seed, same puzzles for everyone; the answer is never public before the reveal', () => {
  const a = mk(3, 9), b = mk(3, 9); toPlay(a); toPlay(b);
  assert.equal(a.state().items, b.state().items);
  const s = a.state(); assert.equal(s.odd, undefined); assert.equal(s.rule, undefined); assert.equal(s.picks, undefined);
  a.act(1, 'tap', 0); assert.equal(a.state().odd, undefined, 'a tap does not leak it either');
  assert.equal(a.priv(2).ok, null, 'nor does another player\'s private state');
});

test('first right tap scores most; a wrong tap locks you out; one tap each', () => {
  const ans = answers(4, 12), g = mk(4, 12); toPlay(g);
  const right = ans[0], wrong = (right + 1) % 6;
  g.act(3, 'tap', wrong); assert.equal(g.priv(3).ok, false);
  g.act(3, 'tap', right); assert.equal(g.priv(3).pick, wrong, 'locked out: the second tap is ignored');
  g.act(2, 'tap', right); g.act(1, 'tap', right);
  assert.equal(g.priv(2).ok, true); assert.equal(g.priv(2).gain, POINTS[0]); assert.equal(g.priv(1).gain, POINTS[1]);
  run(g, ROUND_S);
  const s = g.state(); assert.equal(s.phase, 'reveal'); assert.equal(s.odd, right);
  assert.deepEqual(s.first, [2, 1]); assert.deepEqual(s.gain, { 1: POINTS[1], 2: POINTS[0], 3: 0, 4: 0 });
  assert.deepEqual(s.scores, { 1: POINTS[1], 2: POINTS[0], 3: 0, 4: 0 });
});

test('everyone tapping ends the round early', () => {
  const g = mk(2, 3); toPlay(g); g.act(1, 'tap', 0); g.act(2, 'tap', 1); run(g, 0.7);
  assert.equal(g.state().phase, 'reveal');
});

test('invalid taps are refused', () => {
  const g = mk(2); g.act(1, 'tap', 0); assert.equal(g.priv(1).pick, null, 'not before the first round');
  toPlay(g);
  for (const d of [-1, 9, 99, 1.5, '0', null, { i: 0 }, true]) g.act(1, 'tap', d);
  g.act(1, 'pick', 0); g.act(7, 'tap', 0);
  assert.equal(g.priv(1).pick, null); assert.deepEqual(g.state().in, []);
  run(g, ROUND_S); g.act(1, 'tap', 0); assert.equal(g.priv(1).pick, null, 'not during the reveal');
});

test('nobody taps: six rounds go by, it ends inside meta.seconds, everyone tied on 0', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, n + 30), rounds = new Set();
    for (let t = 0; t < meta.seconds && !g.over; t += 0.05) { g.step(0.05); rounds.add(g.state().round); }
    assert.ok(g.over, `${n} players: ends by itself`); assert.equal(rounds.size, ROUNDS + 1);
    const r = g.result(); assert.deepEqual(r.order, [Array.from({ length: n }, (_, i) => i + 1)]); assert.ok(Object.values(r.scores).every(v => v === 0));
  }
  assert.ok(START_S + ROUNDS * (ROUND_S + REVEAL_S) + 3 <= meta.seconds);
});

test('a perfect player wins alone; ties share a place; solo works', () => {
  const ans = answers(3, 21), g = mk(3, 21);
  let last = -1;
  while (!g.over) { g.step(0.05); const s = g.state(); if (s.phase === 'play' && s.round !== last) { last = s.round; g.act(2, 'tap', ans[s.round]); g.act(1, 'tap', (ans[s.round] + 1) % 6); } }
  assert.deepEqual(g.result().order, [[2], [1, 3]]);
  assert.equal(g.result().scores[2], ROUNDS * POINTS[0]);
  const solo = mk(1, 5), a1 = answers(1, 5); toPlay(solo); solo.act(1, 'tap', a1[0]); run(solo, 1);
  assert.equal(solo.state().phase, 'reveal'); run(solo, meta.seconds); assert.ok(solo.over);
  assert.deepEqual(solo.result(), { order: [[1]], scores: { 1: POINTS[0] }, unit: 'points' });
});

test('state only changes when something changes and stays small', () => {
  const g = mk(4); toPlay(g);
  const s0 = JSON.stringify(g.state()); g.step(0.05); assert.equal(JSON.stringify(g.state()), s0);
  run(g, ROUND_S); assert.ok(JSON.stringify(g.state()).length < 700);
  assert.ok(s0.length < 300, s0.length);
});
