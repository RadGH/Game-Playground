import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeVault, makeQuestions, TREASURES, COLOURS, SIZES, QUESTIONS, STUDY_S, Q_S, BASE, SPEED } from '../js/games/memory-heist/sim.js';

const mk = (n, seed = 4, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toQ = g => { while (g.state().phase !== 'q') g.step(0.05); };

test('every vault and question set is well formed and answerable from the vault (many seeds, every size)', () => {
  for (const [diff, [w, h]] of Object.entries(SIZES)) for (let seed = 1; seed <= 300; seed++) {
    const rng = makeRng(seed), v = makeVault(rng, w, h), qs = makeQuestions(rng, v, w, h);
    assert.equal(v.length, w * h);
    for (const [k, c] of v) { assert.ok(TREASURES[k]); assert.ok(COLOURS[c]); }
    assert.equal(qs.length, QUESTIONS, `${diff} seed ${seed}: five questions`);
    assert.equal(qs[0].kind, 'spot', 'a corner question opens');
    assert.equal(new Set(qs.map(q => q.text)).size, QUESTIONS, 'no question twice');
    const count = k => v.filter(c => c[0] === k).length;
    for (const q of qs) {
      assert.ok(q.opts.length >= 3 && q.opts.length <= 4, q.text);
      assert.equal(new Set(q.opts.map(o => o.t)).size, q.opts.length, `no duplicate answers: ${q.text}`);
      const right = q.opts[q.a];
      if (q.kind === 'spot') assert.equal(right.k, v[q.spot][0]);
      if (q.kind === 'count') { assert.equal(right.n, count(q.k)); assert.ok(right.n >= 1); }
      if (q.kind === 'colour') { assert.equal(count(q.k), 1, 'colour questions only ask about a single item'); assert.equal(right.c, v.find(c => c[0] === q.k)[1]); }
      if (q.kind === 'missing') { assert.equal(count(right.k), 0); for (const o of q.opts) if (o !== right) assert.ok(count(o.k) > 0); }
      if (q.kind === 'most') { const top = Math.max(...TREASURES.map((_, k) => count(k))); assert.equal(count(right.k), top); assert.equal(TREASURES.filter((_, k) => count(k) === top).length, 1); }
    }
  }
});

test('same seed, same vault and questions for everyone; the vault is hidden while questions are asked', () => {
  const a = mk(3, 9), b = mk(3, 9);
  assert.deepEqual(a.state().vault, b.state().vault);
  assert.ok(a.init().vault, 'shown while studying');
  toQ(a);
  assert.equal(a.state().vault, undefined); assert.equal(a.init().vault, undefined, 'a phone that comes back mid-question does not get it either');
  assert.equal(a.state().a, undefined, 'the answer is not public before the reveal');
});

test('fast right answers score more; wrong and missing score nothing; one answer each', () => {
  const g = mk(3);
  toQ(g);
  assert.ok(g.state().q.text);
  g.act(1, 'ans', 0);
  g.act(1, 'ans', 1); assert.equal(g.priv(1).pick, 0, 'cannot change your answer');
  for (let i = 0; i < 40; i++) g.step(0.05);                                       // 2 s later
  g.act(2, 'ans', 0);
  run(g, Q_S);                                                                     // player 3 never answers
  const s = g.state(); assert.equal(s.phase, 'ans');
  const ok = s.a === 0;
  assert.equal(s.gain[3], 0);
  if (ok) { assert.equal(s.gain[1], BASE + SPEED); assert.ok(s.gain[2] < s.gain[1] && s.gain[2] > BASE); }
  else { assert.equal(s.gain[1], 0); assert.equal(s.gain[2], 0); }
});

test('a right answer at once scores 10, and everyone answering skips the wait', () => {
  let found = 0;
  for (let seed = 1; seed < 30; seed++) {
    const g = mk(2, seed); toQ(g);
    g.act(1, 'ans', 0); g.act(2, 'ans', 1);
    const s = g.state(); assert.equal(s.phase, 'ans', 'both answered: reveal now');
    assert.ok(s.a === 0 || s.a === 1 || (s.gain[1] === 0 && s.gain[2] === 0));
    if (s.a === 0) { assert.equal(s.gain[1], 10); assert.equal(s.gain[2], 0); found++; }
    if (s.a === 1) { assert.equal(s.gain[2], 10); assert.equal(s.gain[1], 0); found++; }
    assert.deepEqual(s.picks, { 1: 0, 2: 1 });
  }
  assert.ok(found > 5);
});

test('invalid answers are refused', () => {
  const g = mk(2); g.act(1, 'ans', 0); assert.equal(g.priv(1).pick, null, 'not while studying');
  toQ(g);
  for (const d of [-1, 4, 9, 1.5, '0', null, { i: 0 }, true]) g.act(1, 'ans', d);
  g.act(1, 'pick', 0); g.act(7, 'ans', 0);
  assert.equal(g.priv(1).pick, null); assert.deepEqual(g.state().in, []);
});

test('nobody answers: five questions go by, it ends inside meta.seconds, everyone tied on 0', () => {
  for (const diff of ['easy', 'normal', 'hard']) for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 2, diff); let qs = new Set();
    for (let t = 0; t < meta.seconds && !g.over; t += 0.05) { g.step(0.05); const s = g.state(); if (s.qi != null) qs.add(s.qi); }
    assert.ok(g.over, `${diff}/${n} ends by itself`); assert.equal(qs.size, QUESTIONS);
    const r = g.result(); assert.deepEqual(r.order, [Array.from({ length: n }, (_, i) => i + 1)]);
    assert.ok(Object.values(r.scores).every(v => v === 0));
  }
  assert.ok(Math.max(...Object.values(STUDY_S)) + QUESTIONS * (Q_S + 2.6) + 4 <= meta.seconds);
});

test('solo, and a full game with a perfect player who wins alone', () => {
  const g = mk(3, 21);
  const answers = [];
  // play once to learn the answers, then replay the same seed
  const peek = mk(3, 21); while (!peek.over) { peek.step(0.05); const s = peek.state(); if (s.phase === 'ans' && answers.length === s.qi) answers.push(s.a); }
  let last = -1;
  while (!g.over) { g.step(0.05); const s = g.state(); if (s.phase === 'q' && s.qi !== last) { last = s.qi; g.act(1, 'ans', answers[s.qi]); g.act(2, 'ans', (answers[s.qi] + 1) % s.q.opts.length); } }
  const r = g.result();
  assert.deepEqual(r.order, [[1], [2, 3]]);
  assert.equal(r.scores[1], QUESTIONS * 10);
  assert.equal(g.state().tally[1], QUESTIONS);
  const solo = mk(1); toQ(solo); solo.act(1, 'ans', 0); assert.equal(solo.state().phase, 'ans');
  run(solo, meta.seconds); assert.ok(solo.over); assert.deepEqual(solo.result().order, [[1]]);
});

test('state only changes when something changes and stays small', () => {
  const g = mk(4); toQ(g);
  const s0 = JSON.stringify(g.state()); g.step(0.05); assert.equal(JSON.stringify(g.state()), s0);
  assert.ok(s0.length < 600, s0.length);
});
