import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, timing, HOUSE, CATCH, FOOL, SHARP } from '../js/games/two-truths-one-goblin/sim.js';
import { CARDS } from '../js/games/two-truths-one-goblin/cards.js';

const mk = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const toPhase = (g, ph) => { let n = 0; while (g.state().phase !== ph && !g.over && n++ < 5000) g.step(0.05); };
const shape = (r, pids) => { const all = r.order.flat(); assert.equal(all.length, pids.length); assert.deepEqual([...all].sort(), [...pids].sort()); assert.ok(!('coop' in r)); };
const gobIndex = (g, teller) => g.priv(teller).hand.findIndex(c => c.gob);

test('cards: 100+, two wordings each, all different', () => {
  assert.ok(CARDS.length >= 100);
  assert.ok(CARDS.every(c => c.length === 2 && c[0] !== c[1]));
  assert.equal(new Set(CARDS.flat()).size, CARDS.length * 2);
});

test('the Teller rotates, sees TRUE/GOBLIN privately; nothing leaks to the public state while arranging', () => {
  for (const n of [2, 3, 4]) {
    const g = mk(n, n), tellers = [];
    for (let r = 0; r < timing(n).rounds; r++) {
      toPhase(g, 'prep'); const t = g.state().teller; tellers.push(t);
      const h = g.priv(t).hand; assert.equal(h.length, 3); assert.equal(h.filter(c => c.gob).length, 1); assert.equal(g.priv(t).alt.length, 2);
      assert.equal(g.state().cards, undefined);
      for (const p of [1, 2, 3, 4].slice(0, n)) if (p !== t) assert.deepEqual(g.priv(p), {});
      toPhase(g, 'reveal');
    }
    assert.deepEqual(tellers, Array.from({ length: timing(n).rounds }, (_, i) => i % n + 1));
  }
});

test('the Teller can plant the other Goblin, switch wordings and reorder; that is what everyone sees', () => {
  const g = mk(3); toPhase(g, 'prep'); const t = g.state().teller;
  const before = g.priv(t), alt = before.alt;
  g.act(t, 'plant', 1); let h = g.priv(t).hand;
  assert.deepEqual(h[gobIndex(g, t)].t, alt);
  g.act(t, 'word', 0); g.act(t, 'up', 2); g.act(t, 'up', 0); g.act(t, 'word', 5);
  h = g.priv(t).hand;
  g.act(2, 'word', 1); assert.deepEqual(g.priv(t).hand, h, 'only the Teller arranges');
  g.act(t, 'ready'); g.step(0.05); g.step(0.05); g.step(0.05); g.step(0.05); g.step(0.05); g.step(0.05); g.step(0.05);
  assert.equal(g.state().phase, 'guess', 'Ready ends the arranging early');
  assert.deepEqual(g.state().cards, h.map(c => c.t[c.w]));
});

test('scoring: catch +2, fastest catch +1, Teller +2 per fooled guesser, no guess = nothing', () => {
  const g = mk(4, 7); toPhase(g, 'prep'); const t = g.state().teller, gi = gobIndex(g, t);
  toPhase(g, 'guess');
  const others = [1, 2, 3, 4].filter(p => p !== t);
  g.act(others[1], 'guess', gi); g.step(0.05); g.act(others[0], 'guess', gi); g.act(t, 'guess', gi);
  // others[2] never guesses
  toPhase(g, 'reveal');
  const rv = g.state().reveal;
  assert.equal(rv.gain[others[1]], CATCH + SHARP); assert.equal(rv.gain[others[0]], CATCH); assert.equal(rv.gain[others[2]], 0); assert.equal(rv.gain[t], 0);
  assert.equal(rv.sharp, others[1]);
  toPhase(g, 'prep'); const t2 = g.state().teller, g2 = gobIndex(g, t2); toPhase(g, 'guess');
  const o2 = [1, 2, 3, 4].filter(p => p !== t2);
  for (const p of o2) g.act(p, 'guess', (g2 + 1) % 3);
  toPhase(g, 'reveal'); assert.equal(g.state().reveal.gain[t2], FOOL * 3); assert.equal(g.state().reveal.sharp, null);
});

test('everyone guessed ends the guessing early; guesses can change', () => {
  const g = mk(2); toPhase(g, 'guess'); const t = g.state().teller, p = t === 1 ? 2 : 1;
  g.act(p, 'guess', 0); g.act(p, 'guess', 2); assert.equal(g.priv(p).guess, 2);
  for (let i = 0; i < 45; i++) g.step(0.05);
  assert.equal(g.state().phase, 'reveal'); assert.equal(g.state().reveal.guesses[p], 2);
});

test('2 players: equal points go to the quicker detective', () => {
  const g = mk(2, 21);
  for (let r = 0; r < 4; r++) {
    toPhase(g, 'prep'); const t = g.state().teller, gi = gobIndex(g, t), p = t === 1 ? 2 : 1;
    toPhase(g, 'guess');
    if (r < 2) { if (p === 2) for (let i = 0; i < 10; i++) g.step(0.05); g.act(p, 'guess', gi); }       // each catches once; P2 slower
    else g.act(p, 'guess', (gi + 1) % 3);                                                               // and is fooled once
    toPhase(g, 'reveal');
  }
  while (!g.over) g.step(0.05);
  const r = g.result(); shape(r, [1, 2]);
  assert.equal(r.scores[1], r.scores[2]);
  assert.deepEqual(r.order, [[1], [2]]);
});

test('solo: the House tells, its Goblin is usually its longest claim; the player scores catches', () => {
  let longest = 0, total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = mk(1, seed); toPhase(g, 'guess');
    assert.equal(g.state().teller, HOUSE);
    g.act(1, 'guess', 0); toPhase(g, 'reveal');
    const rv = g.state().reveal, lens = rv.cards.map(c => c.length);
    total++; if (lens[rv.gob] === Math.max(...lens)) longest++;
  }
  assert.ok(longest / total > 0.55 && longest / total < 0.95, `House tell rate ${longest}/${total}`);
  const g = mk(1, 5); let t = 0;
  while (!g.over) { const s = g.state(); if (s.phase === 'guess' && g.priv(1).guess == null) g.act(1, 'guess', 1); g.step(0.05); t += 0.05; }
  const r = g.result(); shape(r, [1]); assert.ok(t <= meta.seconds); assert.equal(r.scores[1] % CATCH, 0);
});

test('every count ends in time with nobody playing; nobody scores', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 30 + n); let t = 0;
    while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over, `ends in time for ${n}`);
    const r = g.result(); shape(r, Array.from({ length: n }, (_, i) => i + 1));
    assert.ok(Object.values(r.scores).every(v => v === 0)); assert.equal(r.order.length, 1);
  }
});
