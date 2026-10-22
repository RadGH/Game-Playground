import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, planRound, settleRound, claimText, CLAIMS, ROUNDS, POT, TRAP, MAX_CLAIMS, START_S, PLAN_S, REVEAL_S, END_S, CPU } from '../js/games/treasure-map-bluff/sim.js';

const mk = (n, seed = 6) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPhase = (g, ph) => { while (g.state().phase !== ph && !g.over) g.step(0.05); };

test('a round map: one treasure, 1 then 2 traps; two players see all four routes between them', () => {
  for (let seed = 1; seed <= 40; seed++) for (const round of [0, 3]) for (const n of [1, 2, 3, 4]) {
    const P = planRound(makeRng(seed), round, n);
    assert.equal(P.content.filter(c => c === 'gold').length, 1);
    assert.equal(P.content.filter(c => c === 'trap').length, round < 2 ? 1 : 2);
    assert.equal(P.sees.length, Math.max(n, 2));
    for (const s of P.sees) { assert.equal(s.length, 2); assert.notEqual(s[0], s[1]); }
    assert.deepEqual([...P.sees[0], ...P.sees[1]].sort(), [0, 1, 2, 3]);
  }
});

test('payouts: the pot splits between finders, traps cost, camp is 0', () => {
  const c = ['gold', 'trap', 'empty', 'trap'];
  assert.deepEqual(settleRound(c, { 1: 0, 2: 1, 3: 2, 4: null }).gain, { 1: POT, 2: -TRAP, 3: 0, 4: 0 });
  assert.deepEqual(settleRound(c, { 1: 0, 2: 0, 3: 0 }).gain, { 1: 4, 2: 4, 3: 4 });
  assert.deepEqual(settleRound(c, { 1: 0, 2: 0, 3: 0, 4: 0 }).gain, { 1: 3, 2: 3, 3: 3, 4: 3 });
  assert.equal(claimText('safe', 1), 'Route B is safe!');
});

test('what you see is private; claims are public and stamped TRUE / FIB at the reveal', () => {
  const g = mk(2); toPhase(g, 'plan');
  const a = g.priv(1), b = g.priv(2);
  assert.equal(Object.keys(a.see).length, 2); assert.equal(Object.keys(b.see).length, 2);
  assert.ok(!JSON.stringify(g.state()).includes('gold"') && !JSON.stringify(g.state()).includes('trap'), 'no contents in public state');
  const all = { ...a.see, ...b.see }, gold = +Object.keys(all).find(r => all[r] === 'gold'), trap = +Object.keys(all).find(r => all[r] === 'trap');
  g.act(1, 'say', { k: 'gold', r: gold }); g.act(2, 'say', { k: 'safe', r: trap }); g.act(2, 'say', { k: 'trust' });
  assert.deepEqual(g.state().claims, [[1, 'gold', gold], [2, 'safe', trap], [2, 'trust', -1]]);
  g.act(1, 'pick', gold); g.act(2, 'pick', gold);
  const rv = (toPhase(g, 'reveal'), g.state().reveal);
  assert.deepEqual(rv.claims.map(c => c[3]), [1, 0, -1]);
  assert.deepEqual(rv.gain, { 1: POT / 2, 2: POT / 2 });
  assert.deepEqual(g.state().scores, { 1: 6, 2: 6 });
});

test('three claims a round at most; picks lock; everyone locked ends the round early', () => {
  const g = mk(2); toPhase(g, 'plan');
  for (let i = 0; i < 5; i++) g.act(1, 'say', { k: 'share' });
  assert.equal(g.state().claims.length, MAX_CLAIMS); assert.equal(g.priv(1).said, MAX_CLAIMS);
  g.act(1, 'lock', true); assert.equal(g.priv(1).locked, false, 'cannot lock with no pick');
  g.act(1, 'pick', 2); g.act(1, 'lock', true); g.act(2, 'pick', 1); g.act(2, 'lock', true);
  run(g, 1); assert.equal(g.state().phase, 'reveal');
  toPhase(g, 'plan'); assert.equal(g.priv(1).said, 0, 'fresh claims next round'); assert.equal(g.priv(1).pick, null);
});

test('traps never take a total below 0', () => {
  const g = mk(1, 3);
  for (let r = 0; r < ROUNDS; r++) { toPhase(g, 'plan'); const see = g.priv(1).see, trap = Object.keys(see).find(k => see[k] === 'trap'); if (trap != null) g.act(1, 'pick', +trap); toPhase(g, 'reveal'); assert.ok(g.state().scores[1] >= 0); }
});

test('bad acts are refused', () => {
  const g = mk(2); g.act(1, 'pick', 1); toPhase(g, 'plan'); assert.equal(g.priv(1).pick, null, 'not before the round');
  for (const d of [-1, 4, 1.5, '1', {}]) { g.act(1, 'pick', d); assert.equal(g.priv(1).pick, null, JSON.stringify(d)); }
  for (const d of [null, 'gold', { k: 'gold' }, { k: 'gold', r: 9 }, { k: 'nope', r: 1 }, { k: 'safe', r: '1' }]) g.act(1, 'say', d);
  assert.deepEqual(g.state().claims, []);
  g.act(9, 'say', { k: 'trust' }); assert.deepEqual(g.state().claims, [], 'a stranger cannot talk');
});

test('solo: Captain Squawk knows the other two routes, says one thing a round, and is not placed', () => {
  let lies = 0, truths = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = mk(1, seed);
    assert.equal(g.init().cpu.pid, CPU);
    for (let r = 0; r < ROUNDS; r++) {
      toPhase(g, "plan"); run(g, 4.5);
      const cl = g.state().claims.filter(c => c[0] === CPU); assert.equal(cl.length, 1);
      assert.ok(!Object.keys(g.priv(1).see).includes(String(cl[0][2])), 'it talks about its own routes');
      toPhase(g, 'reveal'); const st = g.state().reveal.claims.find(c => c[0] === CPU)[3]; st ? truths++ : lies++;
    }
    run(g, 20); assert.ok(g.over); assert.deepEqual(g.result().order, [[1]]); assert.equal(g.result().scores[CPU], undefined);
  }
  assert.ok(lies > 20 && truths > 20, `${truths} true, ${lies} fibs`);
});

test('solo: the parrot still has its say when you lock in at once', () => {
  const g = mk(1, 4); toPhase(g, 'plan'); g.act(1, 'pick', 0); g.act(1, 'lock', true); run(g, 1);
  assert.equal(g.state().phase, 'reveal'); assert.equal(g.state().reveal.claims.filter(c => c[0] === CPU).length, 1);
});

test('ends inside the clock', () => { assert.ok(START_S + ROUNDS * (PLAN_S + REVEAL_S) + END_S <= meta.seconds); const g = mk(3); run(g, meta.seconds); assert.ok(g.over); });

for (const n of [1, 2, 3, 4]) test(`${n} player(s): every pid placed once, ties share`, () => {
  const g = mk(n, 40 + n);
  while (!g.over) { const s = g.state(); if (s.phase === 'plan' && !s.picked.length) for (let p = 1; p <= n; p++) g.act(p, 'pick', (p + s.round) % 4); g.step(0.05); }
  const r = g.result();
  assert.deepEqual(r.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
  for (const grp of r.order) for (const p of grp) assert.equal(r.scores[p], r.scores[grp[0]]);
  const s = r.order.map(grp => r.scores[grp[0]]); for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1]);
});
