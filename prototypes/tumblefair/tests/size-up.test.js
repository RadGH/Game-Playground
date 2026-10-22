import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, planQuiz, clearPair, answerOf, pointsFor, judgeMs, ITEMS, QUESTIONS, ROUNDS, RATIO, THREE_AT, RIGHT, QUICK, Q_S, START_S, REVEAL_S, END_S } from '../js/games/size-up/sim.js';
import { ICONS } from '../js/games/size-up/icons.js';

const mk = (n, seed = 6) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const until = (g, f) => { let k = 0; while (!f(g.state()) && k++ < 10000 && !g.over) g.step(0.05); };
const by = new Map(ITEMS.map(t => [t.id, t]));

test('the item table: ~150 things, unique ids, sane values, every icon built', () => {
  assert.ok(ITEMS.length >= 140, `${ITEMS.length} items`);
  assert.equal(new Set(ITEMS.map(t => t.id)).size, ITEMS.length);
  for (const t of ITEMS) {
    assert.ok(t.name && t.icon && ICONS[t.icon], `${t.id} has an icon`);
    assert.ok(t.m > 0, t.id); assert.ok(t.kg == null || t.kg > 0, t.id); assert.ok(t.kmh == null || t.kmh > 0, t.id);
  }
  assert.ok(ITEMS.filter(t => t.kmh != null).length >= 30, 'enough moving things for speed questions');
  // spot checks that the table is the right way round
  const more = (a, b, s) => assert.ok(by.get(a)[s] > by.get(b)[s] * RATIO, `${a} > ${b} (${s})`);
  more('elephant', 'horse', 'kg'); more('whale', 'elephant', 'kg'); more('horse', 'pig', 'kmh'); more('car', 'bicycle', 'kmh');
  more('sun', 'earth', 'm'); more('earth', 'moon', 'm'); more('bus', 'car', 'kg'); more('jet', 'car', 'kmh'); more('mouse', 'bee', 'm');
});

test('a clear pair: far enough apart, and "bigger" needs size and weight to agree', () => {
  const t = id => by.get(id);
  assert.ok(clearPair(t('elephant'), t('mouse'), 'm'));
  assert.ok(!clearPair(t('cat'), t('dog'), 'kmh'), 'too close');
  assert.ok(!clearPair(t('ruler'), t('apple'), 'm'), 'longer but lighter: not asked as "bigger"');
  assert.ok(!clearPair(t('apple'), t('lemon'), 'kmh'), 'apples do not run');
  assert.ok(clearPair(t('mountain'), t('house'), 'm'), 'no weight: size alone decides');
});

test('every quiz from 300 seeds: 8 questions, threes where planned, no thing twice, every answer clear', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const P = planQuiz(makeRng(seed)), seen = new Set();
    assert.equal(P.length, ROUNDS);
    P.forEach((r, i) => {
      assert.equal(r.ids.length, THREE_AT.includes(i) ? 3 : 2);
      for (const id of r.ids) { assert.ok(!seen.has(id), `seed ${seed}: ${id} twice`); seen.add(id); }
      const stat = QUESTIONS[r.q].stat;
      for (let a = 0; a < r.ids.length; a++) for (let b = a + 1; b < r.ids.length; b++) assert.ok(clearPair(by.get(r.ids[a]), by.get(r.ids[b]), stat), `seed ${seed} q${i}`);
      assert.equal(r.answer, answerOf(r.ids, r.q));
    });
  }
});

test('points: right = 5 + quickness, wrong = 0; the server keeps the phone\'s time honest', () => {
  assert.equal(pointsFor(true, 300), RIGHT + QUICK); assert.equal(pointsFor(true, Q_S * 1000), RIGHT); assert.equal(pointsFor(false, 100), 0);
  assert.ok(pointsFor(true, 3000) > RIGHT && pointsFor(true, 3000) < RIGHT + QUICK);
  assert.equal(judgeMs(400, 900), 400); assert.equal(judgeMs(100, 1500), 800); assert.equal(judgeMs(2000, 900), 950); assert.equal(judgeMs('x', 900), 950);
});

test('answering: first tap is final, all answered skips ahead, junk refused, nothing given away before the reveal', () => {
  const g = mk(3); until(g, s => s.phase === 'q');
  let s = g.state(); assert.equal(s.ids.length, 2); assert.ok(!('answer' in s) && !JSON.stringify(s).includes('answer'));
  for (const bad of [{ i: 2 }, { i: -1 }, { i: 0.5 }, { i: '0' }, null, 1]) g.act(1, 'pick', bad);
  assert.equal(g.priv(1).pick, null);
  g.step(0.5); g.act(1, 'pick', { i: 0, ms: 400 }); g.act(1, 'pick', { i: 1, ms: 450 });
  assert.equal(g.priv(1).pick, 0, 'first tap is final');
  g.act(2, 'pick', { i: 1, ms: 400 }); g.act(9, 'pick', { i: 1 });
  assert.deepEqual(g.state().in, [1, 2]);
  g.act(3, 'pick', { i: 1 });
  for (let k = 0; k < 11; k++) g.step(0.05);
  s = g.state(); assert.equal(s.phase, 'reveal');
  const r = s.reveal, ans = r.answer;
  for (const p of [1, 2]) assert.equal(r.gain[p], r.picks[p] === ans ? RIGHT + QUICK : 0);
  g.act(3, 'pick', { i: 0 }); assert.equal(g.state().reveal.picks[3], 1, 'no answers after the reveal');
});

test('whole games for 1-4 players: in time, the always-right player wins, result shape', () => {
  for (let n = 1; n <= 4; n++) {
    const g = mk(n, 40 + n);
    let t = 0, rr = -1;
    // a twin game from the same seed tells the test the answers
    const twin = mk(n, 40 + n), answers = [];
    while (!twin.over) { const s = twin.state(); if (s.phase === 'reveal' && answers[s.round] == null) answers[s.round] = s.reveal.answer; twin.step(0.05); }
    while (!g.over) {
      const s = g.state();
      if (s.phase === 'q' && rr !== s.round) { rr = s.round; for (let p = 1; p <= n; p++) g.act(p, 'pick', { i: p === 1 ? answers[s.round] : (answers[s.round] + 1) % s.ids.length, ms: 300 }); }
      g.step(0.05); t += 0.05;
    }
    assert.ok(t <= meta.seconds);
    const res = g.result(); assert.deepEqual(res.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
    assert.deepEqual(res.order[0], [1]); assert.equal(res.scores[1], ROUNDS * (RIGHT + QUICK));
    if (n > 1) assert.equal(res.scores[2], 0);
  }
  assert.ok(START_S + ROUNDS * (Q_S + REVEAL_S) + END_S <= meta.seconds);
});

test('nobody answers: ends by itself, tie on 0', () => {
  const g = mk(2); until(g, () => false); assert.ok(g.over); assert.deepEqual(g.result().order, [[1, 2]]);
});
