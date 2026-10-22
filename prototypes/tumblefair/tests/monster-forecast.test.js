import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, planRounds, scorePick, tierOf, MONSTERS, TELLS, ANSWERS, ROUNDS, RIGHT, STREAK_BONUS } from '../js/games/monster-forecast/sim.js';

const mk = (n, seed = 5) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPhase = (g, ph) => { while (g.state().phase !== ph && !g.over) g.step(0.05); };
const monOf = g => MONSTERS.find(m => m.id === g.init().monster);
/** What the true move is, read the way a sharp player would: from the LAST tell. */
const read = (g) => { const s = g.state(), mon = monOf(g), tell = s.cues[s.cues.length - 1][0]; return mon.moves.find(m => m.tells.includes(tell)).answer; };

test('the monster data: every tell exists, one tell = one move per monster, one move per answer', () => {
  assert.ok(MONSTERS.length >= 4);
  for (const m of MONSTERS) {
    assert.equal(m.moves.length, 3, m.id);
    assert.deepEqual(m.moves.map(x => x.answer).sort(), [...ANSWERS].sort(), m.id);
    const all = m.moves.flatMap(x => x.tells); assert.equal(new Set(all).size, all.length, `${m.id}: a tell used twice`);
    for (const t of all) assert.ok(TELLS[t], `${m.id}: unknown tell ${t}`);
  }
});

test('the plan: tiers 1/2/3, fake-outs only in tier 3 and from another move, never one move three times running', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const mon = MONSTERS[seed % MONSTERS.length], plan = planRounds(makeRng(seed), mon);
    assert.equal(plan.length, ROUNDS);
    plan.forEach((r, i) => {
      assert.equal(r.tier, tierOf(i));
      assert.equal(r.cues.length, r.tier === 3 ? 2 : 1);
      assert.ok(mon.moves[r.m].tells.includes(r.cues.at(-1)[0]), 'the last tell is the true one');
      if (r.tier === 3) assert.ok(!mon.moves[r.m].tells.includes(r.cues[0][0]), 'the fake-out belongs to another move');
      if (i >= 2) assert.ok(!(plan[i - 1].m === r.m && plan[i - 2].m === r.m));
    });
  }
});

test('scoring: right = 3, the third right in a row adds a bonus, wrong resets the streak', () => {
  assert.deepEqual(scorePick('dodge', 'dodge', 0), { ok: true, gain: RIGHT, streak: 1 });
  assert.deepEqual(scorePick('dodge', 'dodge', 2), { ok: true, gain: RIGHT + STREAK_BONUS, streak: 3 });
  assert.deepEqual(scorePick('block', 'dodge', 5), { ok: false, gain: 0, streak: 0 });
  assert.deepEqual(scorePick(null, 'dodge', 1), { ok: false, gain: 0, streak: 0 });
});

test('a perfect reader scores every round; the move is secret until the reveal; ends inside the clock', () => {
  const g = mk(2); let t = 0;
  for (let r = 0; r < ROUNDS; r++) {
    toPhase(g, 'tell');
    const s = g.state(); assert.equal(s.reveal, undefined); assert.ok(!('m' in s) && !JSON.stringify(s).includes('answer'));
    g.act(1, 'pick', read(g)); g.act(2, 'pick', ANSWERS.find(a => a !== read(g)));
    assert.deepEqual(g.state().in, [1, 2]);
    toPhase(g, 'reveal'); assert.equal(g.state().reveal.out[1].ok, true); assert.equal(g.state().reveal.out[2].ok, false);
  }
  run(g, 10); assert.ok(g.over);
  assert.equal(g.result().scores[1], ROUNDS * RIGHT + (ROUNDS - 2) * STREAK_BONUS);
  assert.equal(g.result().scores[2], 0);
  assert.deepEqual(g.result().order, [[1], [2]]);
  const h = mk(1, 9); while (!h.over) { h.step(0.05); t += 0.05; } assert.ok(t <= meta.seconds, `${t.toFixed(1)} s`);
});

test('everyone picked during the pick window: it ends at once; picks can change until then', () => {
  const g = mk(2); toPhase(g, 'pick');
  g.act(1, 'pick', 'block'); g.act(1, 'pick', 'dodge'); assert.equal(g.priv(1).pick, 'dodge');
  g.act(2, 'pick', 'counter'); run(g, 0.4); assert.equal(g.state().phase, 'reveal');
  assert.equal(g.state().reveal.out[1].pick, 'dodge');
});

test('bad acts are refused', () => {
  const g = mk(2); g.act(1, 'pick', 'dodge'); assert.equal(g.priv(1).pick, null, 'not before the first tell');
  toPhase(g, 'tell');
  for (const d of ['jump', 1, null, { a: 'dodge' }, 'DODGE']) { g.act(1, 'pick', d); assert.equal(g.priv(1).pick, null, String(d)); }
  g.act(7, 'pick', 'dodge'); assert.deepEqual(g.state().in, []);
  toPhase(g, 'reveal'); g.act(1, 'pick', 'dodge'); assert.equal(g.priv(1).pick, null, 'not during the reveal');
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): every pid placed once, ties share`, () => {
  const g = mk(n, 30 + n);
  while (!g.over) { const s = g.state(); if (s.phase === 'tell' && !(s.in || []).length) for (let p = 1; p <= n; p++) g.act(p, 'pick', p === 1 ? read(g) : ANSWERS[(p + s.round) % 3]); g.step(0.05); }
  const r = g.result();
  assert.deepEqual(r.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
  for (const grp of r.order) for (const p of grp) assert.equal(r.scores[p], r.scores[grp[0]]);
  const s = r.order.map(grp => r.scores[grp[0]]); for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1]);
});

test('nobody picks: a draw at 0', () => { const g = mk(3); run(g, 70); assert.deepEqual(g.result().order, [[1, 2, 3]]); });

test('same seed, same game', () => {
  const a = mk(2, 77), b = mk(2, 77); assert.equal(a.init().monster, b.init().monster);
  toPhase(a, 'tell'); toPhase(b, 'tell'); assert.deepEqual(a.state().cues, b.state().cues);
});
