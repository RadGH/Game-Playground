import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, PROMPTS, MAX_POINTS, MAX_CUTS, MAX_CHUNK, CARVE_S, VOTE_S, measure, soloScore, cells } from '../js/games/pumpkin-carve-off/sim.js';
import { eligible } from '../js/games/index.js';
import { world, withBots } from './helpers.js';

const mk = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty: 'normal', season: 'halloween' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const hx = (x, y) => x.toString(16).padStart(2, '0') + y.toString(16).padStart(2, '0');
const line = (x0, y0, x1, y1, n = 8) => Array.from({ length: n }, (_, i) => hx(Math.round(x0 + (x1 - x0) * i / (n - 1)), Math.round(y0 + (y1 - y0) * i / (n - 1)))).join('');
const face = (g, pid, sid = 1) => { g.act(pid, 'cut', { s: sid, w: 1, p: line(90, 100, 100, 110) }); g.act(pid, 'cut', { s: sid + 1, w: 1, p: line(156, 100, 166, 110) }); g.act(pid, 'cut', { s: sid + 2, w: 0, p: line(80, 170, 176, 170) }); };
const toVote = g => { for (const p of [1, 2, 3, 4]) g.act(p, 'done', true); run(g, 1); assert.equal(g.state().phase, g.init().solo ? 'reveal' : 'vote'); };
const placed = r => r.order.flat().sort();

test('meta: a Halloween holiday game, offered only in its season', () => {
  assert.equal(meta.season, 'halloween'); assert.ok(meta.tags.includes('holiday'));
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
  assert.ok(!eligible(3, [], null).includes(meta.id), 'not offered out of season');
  assert.ok(eligible(3, [], 'halloween').includes(meta.id), 'offered at Halloween');
  assert.ok(eligible(1, [], 'halloween').includes(meta.id));
});

test('the prompts: 40+ different, clean, spooky-cute pumpkins', () => {
  assert.ok(PROMPTS.length >= 40, PROMPTS.length);
  assert.equal(new Set(PROMPTS).size, PROMPTS.length);
  for (const p of PROMPTS) { assert.match(p, /pumpkin/); assert.ok(p.length < 50, p); assert.doesNotMatch(p, /muster|ember|veil|blood|kill|dead|gore/i); }
});

test('everyone gets a different secret prompt; the public state never shows it until the reveal', () => {
  const g = mk(4);
  const ps = [1, 2, 3, 4].map(p => g.priv(p).prompt);
  assert.equal(new Set(ps).size, 4);
  for (const p of ps) assert.ok(!JSON.stringify(g.state()).includes(p));
  assert.deepEqual(mk(4).priv(2), g.priv(2), 'same seed, same prompts');
  face(g, 1); face(g, 2); face(g, 3); face(g, 4); toVote(g);
  for (const p of ps) assert.ok(!JSON.stringify(g.state()).includes(p), 'not while voting either');
  run(g, VOTE_S + 1);
  const r = g.state().reveal; assert.ok(r);
  assert.deepEqual([...r.prompts].sort(), [...ps].sort(), 'the reveal shows every prompt');
  r.who.forEach((pid, i) => assert.equal(r.prompts[i], g.priv(pid).prompt));
});

test('cuts: new, continued in chunks, undo, clear, and junk refused', () => {
  const g = mk(2);
  g.act(1, 'cut', { s: 1, w: 0, p: line(60, 60, 100, 100) });
  g.act(1, 'cut', { s: 1, w: 0, p: line(100, 100, 140, 60) });
  assert.equal(g.priv(1).n, 1);
  g.act(1, 'cut', { s: 2, w: 1, p: line(80, 180, 180, 180) });
  assert.equal(g.priv(1).n, 2); assert.equal(g.state().n[1], 2);
  for (const bad of [null, 5, 'x', [], { s: 3, w: 2, p: '0000' }, { s: 3, w: 0, p: '00' }, { s: 3, w: 0, p: 'zzzz' }, { s: 3, w: 0, p: '' }, { s: -1, w: 0, p: '0000' }, { s: 1.5, w: 0, p: '0000' },
    { s: 3, w: 0, p: '0000'.repeat(MAX_CHUNK + 1) }, { s: 1, w: 0, p: '0000' }])
    g.act(1, 'cut', bad);
  assert.equal(g.priv(1).n, 2);
  g.act(9, 'cut', { s: 5, w: 0, p: '0000' }); g.act(1, 'vote', 0); g.act(1, 'carve', 1);
  g.act(1, 'undo'); assert.equal(g.priv(1).n, 1);
  g.act(1, 'clear'); assert.equal(g.priv(1).n, 0);
  assert.deepEqual(g.restore(1).cuts, []);
  g.act(1, 'cut', { s: 9, w: 1, p: line(100, 100, 120, 120) });
  assert.equal(g.restore(1).cuts.length, 1, 'restore gives a returning phone its carving');
});

test('a carving has a size limit in points and cuts', () => {
  const g = mk(1);
  for (let s = 1; s <= MAX_CUTS + 20; s++) g.act(1, 'cut', { s, w: 0, p: hx(100 + (s % 50), 120) });
  assert.equal(g.priv(1).n, MAX_CUTS);
  const h = mk(1), big = '7878'.repeat(MAX_CHUNK);
  for (let s = 1; s <= 20; s++) h.act(1, 'cut', { s, w: 0, p: big });
  assert.equal(h.restore(1).cuts.reduce((n, c) => n + c[1].length / 4, 0), MAX_POINTS);
  assert.equal(h.priv(1).full, true);
});

test('measure: cells only inside the pumpkin; an even face scores evenness 100, a one-sided one low', () => {
  assert.equal(cells([[0, line(0, 0, 10, 0)]]).size, 0, 'the corner is outside the pumpkin');
  const even = [[1, line(90, 100, 100, 110)], [1, line(156, 100, 166, 110)], [0, line(80, 170, 176, 170)]];
  const m = measure(even); assert.ok(m.ink > 10); assert.equal(m.cuts, 3); assert.ok(m.even >= 80, `even ${m.even}`);
  const lop = measure([[1, line(60, 100, 90, 160)]]); assert.ok(lop.even < 30, `lopsided ${lop.even}`);
  assert.deepEqual(measure([]), { ink: 0, cuts: 0, even: 0 });
  assert.equal(soloScore([]), 0);
  assert.ok(soloScore(even) >= 5 && soloScore(even) <= 10, `even face ${soloScore(even)}`);
  assert.ok(soloScore(even) > soloScore([[0, line(60, 100, 70, 110)]]), 'a whole face beats one small nick');
});

test('voting: never your own, never a blank, 2 players may say both; ends early when all voted', () => {
  const g = mk(3);
  face(g, 1); face(g, 2);                                  // player 3 carves nothing
  toVote(g);
  const mine1 = g.priv(1).mine, blank = g.priv(3).mine;
  g.act(1, 'vote', mine1); assert.equal(g.priv(1).vote, null, 'not your own');
  g.act(1, 'vote', blank); assert.equal(g.priv(1).vote, null, 'not a blank one');
  g.act(1, 'vote', 'both'); assert.equal(g.priv(1).vote, null, 'both only for two players');
  g.act(1, 'vote', g.priv(2).mine); g.act(2, 'vote', mine1); g.act(3, 'vote', mine1);
  run(g, 1.2); assert.equal(g.state().phase, 'reveal', 'everyone voted: straight to the reveal');
  const r = g.result(); assert.deepEqual(placed(r), [1, 2, 3]);
  assert.equal(r.order[0][0], 1, 'two votes beats one');
  assert.equal(r.scores[3], 0);
  const two = mk(2); face(two, 1); face(two, 2); toVote(two); two.act(1, 'vote', 'both'); two.act(2, 'vote', 'both'); run(two, 1.2);
  assert.equal(two.state().reveal.got[1], 2); assert.equal(two.state().reveal.got[2], 2);
});

test('the judge ribbon breaks a 2-player tie; ties share a place otherwise', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = mk(2, seed);
    face(g, 1); g.act(2, 'cut', { s: 1, w: 0, p: line(100, 120, 110, 120) });     // player 1 carves more (and more cuts, and evener)
    toVote(g); g.act(1, 'vote', g.priv(2).mine); g.act(2, 'vote', g.priv(1).mine); run(g, 30);
    const r = g.result(), j = g.init().judge.id;
    assert.ok(g.over); assert.deepEqual(placed(r), [1, 2]);
    assert.equal(r.order[0].length, 1, `seed ${seed} judge ${j}: the ribbon settles it`); assert.deepEqual(r.order[0], [1]);
  }
  const t = mk(4, 5); for (const p of [1, 2, 3, 4]) face(t, p); toVote(t); run(t, VOTE_S + 30);
  const r = t.result(); assert.deepEqual(placed(r), [1, 2, 3, 4]);
  assert.equal(r.order[0].length, 4, 'identical carvings, no votes: all share the ribbon and first place');
});

test('solo: a practice round scored 0-10 by the judge, no vote', () => {
  const g = mk(1); face(g, 1); g.act(1, 'done', true); run(g, 1);
  assert.equal(g.state().phase, 'reveal');
  run(g, 30); assert.ok(g.over);
  const r = g.result(); assert.deepEqual(r.order, [[1]]); assert.ok(r.scores[1] >= 1 && r.scores[1] <= 10);
  const b = mk(1); run(b, CARVE_S + 30); assert.ok(b.over); assert.equal(b.result().scores[1], 0, 'nothing carved, nothing scored');
});

test('ends by itself within meta.seconds for 1-4 players, every pid placed once', () => {
  for (let n = 1; n <= 4; n++) {
    const g = mk(n, 40 + n); for (let p = 1; p <= n; p += 2) face(g, p);
    let t = 0; while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over, `${n} players end`); assert.ok(t <= meta.seconds);
    const r = g.result(); assert.deepEqual(placed(r), Array.from({ length: n }, (_, i) => i + 1)); assert.equal(r.unit, 'points');
  }
});

test('the room plays whole matches of it with bots (Halloween forced on)', () => {
  for (const n of [1, 2, 4]) {
    const W = world({ seed: 20 + n }), ph = [withBots(W.phone())];
    ph[0].send({ t: 'create' }); const code = ph[0].room.code;
    for (let i = 1; i < n; i++) { const p = withBots(W.phone()); p.send({ t: 'join', code }); ph.push(p); }
    ph[0].send({ t: 'opt', key: 'holiday', value: 'halloween' }); ph[0].send({ t: 'opt', key: 'mode', value: 'marathon' }); ph[0].send({ t: 'opt', key: 'pool', value: [meta.id] }); ph[0].send({ t: 'opt', key: 'rounds', value: 1 });
    ph[0].send({ t: 'start' });
    const done = W.run(5 * 60 * 1000, () => ph[0].phase === 'results');
    assert.ok(done, `${n}: reached results`);
    const res = ph[0].last.phase.result;
    assert.equal(ph[0].last.phase.game, meta.id);
    assert.equal(res.order.flat().length, n);
    if (n > 1) assert.ok(Object.values(res.scores).some(v => v > 0), 'bots voted');
  }
});
