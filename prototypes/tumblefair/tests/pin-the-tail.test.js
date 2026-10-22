import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, planRound, tailOf, points, settleRound, ANIMALS, KINDS, TRICKS, BW, BH, NEAR, CLOSEST_BONUS, ROUNDS, START_S, SHOW_S, TRICK_S, GUESS_S, REVEAL_S, END_S } from '../js/games/pin-the-tail/sim.js';

const mk = (n, seed = 8) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const until = (g, f) => { let k = 0; while (!f(g.state()) && k++ < 10000 && !g.over) g.step(0.05); };
const inBoard = a => { const A = ANIMALS[a.k]; return a.x >= 0 && a.y >= 0 && a.x + A.w * a.s <= BW && a.y + A.h * a.s <= BH; };

test('points: 10 on the spot, none from NEAR away', () => {
  assert.equal(points(0), 10); assert.equal(points(NEAR / 2), 5); assert.equal(points(NEAR), 0); assert.equal(points(80), 0); assert.equal(points(null), 0);
});

test('every round\'s animals stay in the paddock and the answer follows the trick', () => {
  for (let seed = 1; seed < 150; seed++) {
    const rng = makeRng(seed);
    TRICKS.forEach((trick, i) => {
      const P = planRound(rng, i);
      assert.equal(P.trick, trick);
      for (const a of [...P.from, ...P.to]) { assert.ok(KINDS.includes(a.k)); assert.ok(inBoard(a), `${trick} ${JSON.stringify(a)}`); }
      const t = tailOf(P.to[0]);
      if (trick === 'spin') { assert.equal(P.rot, 180); assert.deepEqual(P.target, [Math.round((BW - t[0]) * 10) / 10, Math.round((BH - t[1]) * 10) / 10]); }
      else { assert.equal(P.rot, 0); assert.deepEqual(P.target, t.map(v => Math.round(v * 10) / 10)); }
      if (trick === 'slide') assert.ok(Math.hypot(P.to[0].x - P.from[0].x, P.to[0].y - P.from[0].y) >= 30, 'it really moves');
      if (trick === 'swap') { assert.equal(P.from.length, 2); assert.notEqual(P.from[0].k, P.from[1].k); assert.ok(Math.hypot(P.target[0] - P.start[0], P.target[1] - P.start[1]) > 25, 'the swap moves the tail a long way'); }
      assert.ok(P.target[0] >= 0 && P.target[0] <= BW && P.target[1] >= 0 && P.target[1] <= BH);
    });
  }
});

test('a tail point sits on the animal and flips with it', () => {
  for (const k of KINDS) {
    const A = ANIMALS[k], a = { k, x: 10, y: 20, s: 1, f: false }, b = { ...a, f: true };
    assert.deepEqual(tailOf(a), [10 + A.tail[0], 20 + A.tail[1]]);
    assert.deepEqual(tailOf(b), [10 + A.w - A.tail[0], 20 + A.tail[1]]);
    assert.ok(A.tail[0] < A.w / 3, `${k}: the tail is at the back`);
  }
});

test('settling: distance points, closest bonus (ties share, not when nobody is near), no pin = 0', () => {
  let r = settleRound({ 1: [50, 50], 2: [55, 50], 3: [50, 62] }, [50, 50], [1, 2, 3, 4]);
  assert.deepEqual(r.closest, [1]); assert.equal(r.gain[1], 10 + CLOSEST_BONUS); assert.equal(r.gain[2], points(5)); assert.equal(r.gain[4], 0);
  r = settleRound({ 1: [45, 50], 2: [55, 50] }, [50, 50], [1, 2]); assert.deepEqual(r.closest, [1, 2]);
  r = settleRound({ 1: [150, 90] }, [10, 10], [1, 2]); assert.deepEqual(r.closest, [], 'far off is not rewarded');
  r = settleRound({ 1: [10, 10] }, [10, 10], [1]); assert.deepEqual(r.closest, [], 'alone: no closest bonus'); assert.equal(r.gain[1], 10);
});

test('the phases and what the state shows in each', () => {
  const g = mk(2);
  until(g, s => s.phase === 'show'); let s = g.state();
  assert.equal(s.trick, 'blur'); assert.ok(s.star && s.animals.length === 1); assert.equal(s.reveal, undefined);
  until(g, s => s.phase === 'guess'); s = g.state();
  assert.ok(s.animals, 'round 1 keeps the blurry animal'); assert.equal(s.star, undefined); assert.equal(s.target, undefined);
  until(g, s => s.phase === 'show' && s.round === 1);
  until(g, s => s.phase !== 'show'); assert.equal(g.state().phase, 'guess', 'hide: no trick phase'); assert.equal(g.state().animals, undefined);
  until(g, s => s.round === 2 && s.phase !== 'show'); s = g.state();
  assert.equal(s.phase, 'trick'); assert.ok(s.to && s.animals);
  assert.ok(!JSON.stringify(s).includes('target'), 'the answer stays hidden');
});

test('pins: the last tap counts, done locks only with a pin, bad pins refused, all done ends early', () => {
  const g = mk(3); until(g, s => s.phase === 'guess');
  g.act(1, 'pin', [10, 10]); g.act(1, 'pin', [20, 30]);
  for (const bad of [[-1, 5], [5, BH + 1], [NaN, 3], ['1', 2], [1], null, 'x']) g.act(2, 'pin', bad);
  g.act(2, 'done'); assert.deepEqual(g.priv(2), { pin: null, done: false });
  assert.deepEqual(g.priv(1).pin, [20, 30]);
  g.act(1, 'done'); g.act(2, 'pin', [1, 1]); g.act(2, 'done');
  assert.equal(g.state().phase, 'guess'); g.act(3, 'pin', [2, 2]); g.act(3, 'done');
  for (let i = 0; i < 13; i++) g.step(0.05);
  assert.equal(g.state().phase, 'reveal');
  const r = g.state().reveal; assert.deepEqual(r.pins[1], [20, 30]); assert.ok(r.target);
  g.act(1, 'pin', [5, 5]); assert.deepEqual(g.state().reveal.pins[1], [20, 30], 'no pinning after the reveal');
});

test('whole games for 1-4 players: in time, perfect pinner wins, result shape', () => {
  for (let n = 1; n <= 4; n++) {
    const g = mk(n, 30 + n); let t = 0, rr = -1;
    while (!g.over) {
      const s = g.state();
      if (s.phase === 'guess' && rr !== s.round) {
        rr = s.round;
        // the test peeks at the answer through a twin game made from the same seed
        const twin = mk(n, 30 + n); until(twin, x => x.phase === 'reveal' && x.round === s.round);
        const tg = twin.state().reveal.target;
        for (let p = 1; p <= n; p++) { g.act(p, 'pin', [tg[0] + (p - 1) * 4, tg[1]]); g.act(p, 'done'); }
      }
      g.step(0.05); t += 0.05;
    }
    assert.ok(t <= meta.seconds, `${n}: ${t}`);
    const res = g.result(); assert.deepEqual(res.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
    assert.deepEqual(res.order[0], [1]);
    assert.equal(res.scores[1], ROUNDS * (10 + (n > 1 ? CLOSEST_BONUS : 0)));
  }
  assert.ok(START_S + ROUNDS * (SHOW_S + GUESS_S + REVEAL_S) + 3 * TRICK_S + END_S <= meta.seconds);
});

test('nobody pins: ends by itself, all tied on 0', () => {
  const g = mk(4); until(g, () => false);
  assert.ok(g.over); assert.deepEqual(g.result().order, [[1, 2, 3, 4]]);
});
