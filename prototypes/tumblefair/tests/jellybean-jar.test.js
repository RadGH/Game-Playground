import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, closeness, settleRound, ROUNDS, RANGES, THINGS, START_S, GUESS_S, REVEAL_S, END_S, CLOSEST_BONUS, EXACT_BONUS } from '../js/games/jellybean-jar/sim.js';
import { layout } from '../js/games/jellybean-jar/jar-art.js';

const mk = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const step = (g, s) => { for (let t = 0; t < s - 1e-9 && !g.over; t += 0.05) g.step(0.05); };
const toGuess = g => { const r = g.state().round; let k = 0; while (!(g.state().phase === 'guess' && g.state().round > r) && k++ < 5000) g.step(0.05); };
const toReveal = g => { let k = 0; while (g.state().phase !== 'reveal' && k++ < 5000) g.step(0.05); return g.state().reveal; };

test('closeness: 10 when spot on, nothing once half the number away', () => {
  assert.equal(closeness(100, 100), 10); assert.equal(closeness(90, 100), 8); assert.equal(closeness(150, 100), 0); assert.equal(closeness(40, 100), 0);
  assert.equal(closeness(null, 100), 0); assert.equal(closeness(0, 30), 0);
});

test('settling a round: closest bonus (ties share), exact bonus, no guess scores 0', () => {
  let r = settleRound({ 1: 50, 2: 60, 3: 40 }, 50, [1, 2, 3]);
  assert.deepEqual(r.closest, [1]); assert.deepEqual(r.exact, [1]); assert.equal(r.gain[1], 10 + EXACT_BONUS + CLOSEST_BONUS);
  assert.equal(r.gain[2], closeness(60, 50)); assert.equal(r.gain[3], closeness(40, 50));
  r = settleRound({ 1: 45, 2: 55 }, 50, [1, 2, 3]);
  assert.deepEqual(r.closest, [1, 2], 'a tie shares the closest bonus'); assert.equal(r.gain[3], 0);
  r = settleRound({ 1: 50 }, 50, [1]);
  assert.deepEqual(r.closest, [], 'alone: no closest bonus'); assert.equal(r.gain[1], 10 + EXACT_BONUS);
  r = settleRound({}, 50, [1, 2]); assert.deepEqual(r.closest, []); assert.deepEqual(r.gain, { 1: 0, 2: 0 });
});

test('three rounds, a different thing each, more of them each round, all from the seed', () => {
  const g = mk(2), h = mk(2), seen = [];
  for (let i = 0; i < ROUNDS; i++) {
    toGuess(g); toGuess(h);
    const s = g.state(); assert.equal(s.round, i); assert.deepEqual([s.thing, s.n, s.look], [h.state().thing, h.state().n, h.state().look]);
    assert.ok(THINGS.includes(s.thing)); assert.ok(s.n >= RANGES[i][0] && s.n <= RANGES[i][1]); seen.push(s.thing);
  }
  assert.equal(new Set(seen).size, ROUNDS);
});

test('the picture always holds exactly the number asked, inside the picture', () => {
  for (const thing of THINGS) for (const n of [RANGES[0][0], 77, RANGES[2][1]]) for (const look of [1, 99, 123456]) {
    const L = layout(thing, n, look, 0.7);
    assert.equal(L.items.length, n, `${thing} ${n}`);
    assert.ok(L.items.every(it => it.x > 0 && it.x < 200 && it.y > 0 && it.y < 240));
    assert.ok(L.r > 3, `items big enough to see (${thing} ${n}: r ${L.r})`);
    assert.deepEqual(layout(thing, n, look, 0.7), L, 'same picture every time');
  }
});

test('guessing: drafts count, OK locks, everyone locked skips the wait, bad input refused', () => {
  const g = mk(3); toGuess(g);
  const n = g.state().n;
  g.act(1, 'guess', { n: n, ok: true });
  g.act(2, 'guess', { n: n + 5 });            // a draft, never OK'd
  for (const bad of [{ n: -1 }, { n: 1.5 }, { n: '7' }, { n: 10000 }, null, 7]) g.act(3, 'guess', bad);
  assert.equal(g.priv(3).guess, null);
  assert.deepEqual(g.state().in, [1]); assert.deepEqual(g.state().typing, [2]);
  assert.ok(!('reveal' in g.state()));
  g.act(9, 'guess', { n: 5, ok: true });      // not a player
  const r = toReveal(g);
  assert.equal(r.guesses[2], n + 5, 'the draft counted'); assert.equal(r.guesses[3], undefined);
  assert.deepEqual(r.exact, [1]); assert.equal(g.state().scores[1], 10 + EXACT_BONUS + CLOSEST_BONUS);
  // clearing a guess removes it
  toGuess(g); g.act(1, 'guess', { n: 5 }); g.act(1, 'guess', { n: null }); assert.equal(g.priv(1).guess, null);
  // everyone locked: the round ends within a second
  toGuess(g); for (const p of [1, 2, 3]) g.act(p, 'guess', { n: 10, ok: true });
  step(g, 1.05); assert.equal(g.state().phase, 'reveal');
});

test('acts outside the guessing phase do nothing', () => {
  const g = mk(2); g.act(1, 'guess', { n: 5, ok: true }); toGuess(g); assert.equal(g.priv(1).guess, null);
  toReveal(g); g.act(1, 'guess', { n: 5, ok: true }); assert.equal(g.state().reveal.guesses[1], undefined);
});

test('a whole game for 1-4 players ends in time with every player once in the order', () => {
  for (let n = 1; n <= 4; n++) {
    const g = mk(n, 10 + n);
    let t = 0;
    while (!g.over && t < meta.seconds) {
      const s = g.state();
      if (s.phase === 'guess') for (let p = 1; p <= n; p++) g.act(p, 'guess', { n: s.n + p * 3 - 3, ok: true });
      g.step(0.05); t += 0.05;
    }
    assert.ok(g.over, `${n} players ended`); assert.ok(t <= START_S + ROUNDS * (GUESS_S + REVEAL_S) + END_S + 0.2);
    const res = g.result();
    assert.deepEqual(res.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(res.unit, 'points');
    if (n > 1) assert.deepEqual(res.order[0], [1], 'the one who was always spot on wins');
    if (n === 1) assert.equal(res.scores[1], ROUNDS * (10 + EXACT_BONUS));
  }
});

test('a game where nobody guesses ends by the clock, everyone tied on 0', () => {
  const g = mk(3); step(g, meta.seconds);
  assert.ok(g.over); assert.deepEqual(g.result().order, [[1, 2, 3]]); assert.deepEqual(g.result().scores, { 1: 0, 2: 0, 3: 0 });
});
