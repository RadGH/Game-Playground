import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeChart, scoreOf, maxScore, mult, stepSec, COUNT_S, END_S, BPM, PATTERNS, LATE_MISS, EARLY } from '../js/games/one-button-orchestra/sim.js';
import { world, withBots } from './helpers.js';

const mk = (n, seed = 5, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty });
const placed = r => r.order.flat().sort((a, b) => a - b);
const toPlay = g => { while (g.state().phase === 'count') g.step(0.05); };
/** Step the game until `sec` seconds of music have passed. */
const playTo = (g, sec) => { toPlay(g); const per = 0.05; let el = 0; while (el + per <= sec + 1e-9) { g.step(per); el += per; } };

test('the chart: same seed same chart; four sections that get busier; a final note; fits the clock', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 30; seed++) {
      const a = makeChart(makeRng(seed), d), b = makeChart(makeRng(seed), d);
      assert.deepEqual(a, b);
      assert.equal(a.bpm, BPM[d]);
      assert.ok(a.steps.every((s, i) => i === 0 || s > a.steps[i - 1]), 'notes in order, never two on one step');
      assert.ok(a.steps[0] >= 8, 'the first bar is a lead-in with no notes');
      assert.equal(a.steps.at(-1), (a.bars - 1) * 8, 'the last note is the downbeat of the last bar');
      assert.equal(a.sec.length, 4); assert.ok(a.sec.every((b2, i) => i === 0 || b2 > a.sec[i - 1]));
      const song = a.bars * 8 * stepSec(a.bpm);
      assert.ok(song <= 36.5 && song >= 33, `${d}: ${song.toFixed(1)} s of music`);
      assert.ok(COUNT_S + song + 0.6 + END_S + 1 <= meta.seconds);
      // notes a bar: the finale is busier than the warm-up
      const per = lv => { const from = a.sec[lv] * 8, to = (a.sec[lv + 1] ?? a.bars - 1) * 8; return a.steps.filter(s => s >= from && s < to).length / ((to - from) / 8); };
      assert.ok(per(3) > per(0), `${d} seed ${seed}: finale ${per(3)} vs warm-up ${per(0)}`);
    }
  }
  for (const level of PATTERNS) for (const p of level) assert.match(p, /^[x.]{8}$/);
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
});

test('scoring: perfect 100, good 50, the combo multiplies, a miss or a stray tap breaks it', () => {
  const chart = { bpm: 120, bars: 4, steps: Array.from({ length: 20 }, (_, i) => 8 + i), sec: [1, 1, 2, 3] };
  const all = new Map(chart.steps.map((s, i) => [i, 0]));
  assert.equal(mult(0), 1); assert.equal(mult(7), 1); assert.equal(mult(8), 2); assert.equal(mult(16), 3); assert.equal(mult(99), 4);
  // 8 at x1, 8 at x2, 4 at x3
  assert.equal(scoreOf(chart, all, new Set()).score, 8 * 100 + 8 * 200 + 4 * 300);
  assert.equal(maxScore(chart), 3600);
  const s = scoreOf(chart, new Map([[0, 0], [1, 1]]), new Set());
  assert.equal(s.score, 150); assert.equal(s.p, 1); assert.equal(s.g, 1); assert.equal(s.miss, 18, 'the rest never played');
  // a miss in the middle breaks the combo
  const gap = new Map(chart.steps.map((x, i) => [i, 0])); gap.delete(8);
  const sg = scoreOf(chart, gap, new Set());
  assert.equal(sg.miss, 1); assert.equal(sg.best, 11); assert.equal(sg.score, 8 * 100 + (8 * 100 + 3 * 200), 'the combo starts again from x1 after the miss');
  // a stray tap just before note 8 breaks it too
  assert.equal(scoreOf(chart, all, new Set([8])).best, 12);
  // notes still to come are not misses yet
  const live = scoreOf(chart, new Map([[0, 0]]), new Set(), (8 + 1) * stepSec(120) + LATE_MISS - 0.01);
  assert.equal(live.miss, 0, 'note 1 is not late yet');
});

test('the server only takes judgements that could have happened', () => {
  const g = mk(2), ch = g.init().chart, ss = stepSec(ch.bpm), t = n => ch.steps[n] * ss;
  g.act(1, 'hit', { n: 0, q: 0 }); toPlay(g);
  assert.equal(g.state().st[1][2], 0, 'nothing before the music starts');
  g.act(1, 'hit', { n: 0, q: 0 }); assert.equal(g.state().st[1][2], 0, 'note 0 is not due yet');
  playTo(g, t(0) - EARLY + 0.06);
  g.act(1, 'hit', { n: 0, q: 0 }); g.act(1, 'hit', { n: 0, q: 1 });
  assert.deepEqual(g.state().st[1].slice(2, 4), [1, 0], 'counted once, the first verdict stands');
  for (const d of [{ n: 1.5, q: 0 }, { n: -1, q: 0 }, { n: 999, q: 0 }, { n: 1, q: 2 }, { n: 1 }, 'x', null, 1]) g.act(1, 'hit', d);
  g.act(1, 'hit', { n: 5, q: 0 }); assert.equal(g.state().st[1][2], 1, 'a far-future note is refused');
  g.act(2, 'stray', 1); g.act(2, 'stray', 1); g.act(2, 'stray', 40); g.act(2, 'stray', 'a'); g.act(7, 'hit', { n: 0, q: 0 });
  playTo(g, 0.2); g.act(2, 'hit', { n: 0, q: 1 });
  assert.equal(g.state().st[2][3], 1, 'player 2: a good on note 0, sent late (the network) is fine');
});

test('a perfect run beats a sloppy run; everyone placed once; ties share a place', () => {
  const g = mk(4, 13), ch = g.init().chart, ss = stepSec(ch.bpm);
  toPlay(g);
  let el = 0;
  for (let n = 0; n < ch.steps.length; n++) {
    while (el < ch.steps[n] * ss + 0.1) { g.step(0.05); el += 0.05; }
    g.act(1, 'hit', { n, q: 0 });                         // perfect
    g.act(2, 'hit', { n, q: 0 });                         // perfect too: tied with 1
    if (n % 2) g.act(3, 'hit', { n, q: 1 });              // half, all good
    // 4 does nothing
  }
  for (let i = 0; i < 400 && !g.over; i++) g.step(0.05);
  assert.ok(g.over);
  const r = g.result();
  assert.deepEqual(r.order, [[1, 2], [3], [4]]);
  assert.equal(r.scores[1], g.init().max); assert.equal(r.scores[4], 0);
  assert.deepEqual(placed(r), [1, 2, 3, 4]); assert.equal(r.unit, 'points');
  const end = g.state().st; assert.equal(end[4][4], ch.steps.length, 'all of player 4\'s notes are misses at the end');
});

test('instruments by seat; solo works; ends inside meta.seconds for 1-4 players and every difficulty', () => {
  const g = mk(3); assert.deepEqual(g.init().instrument, { 1: 0, 2: 1, 3: 2 });
  for (const d of ['easy', 'normal', 'hard']) for (const n of [1, 2, 3, 4]) {
    const h = mk(n, 50 + n, d); let t = 0;
    for (; t < meta.seconds + 3 && !h.over; t += 0.05) h.step(0.05);
    assert.ok(h.over && t <= meta.seconds, `${d} ${n}: ${t.toFixed(1)} s`);
    assert.deepEqual(placed(h.result()), Array.from({ length: n }, (_, i) => i + 1));
  }
  assert.equal(mk(1).init().solo, true);
});

test('state is small: scores per player and the section; nothing about the future', () => {
  const g = mk(2); toPlay(g); playTo(g, 12);
  const s = g.state();
  assert.deepEqual(Object.keys(s).sort(), ['left', 'phase', 'sec', 'st']);
  assert.ok(s.sec >= 0 && s.sec <= 3); assert.ok(JSON.stringify(s).length < 120);
});

test('through the room with bot phones: 1-4 players finish with points', () => {
  for (const n of [1, 2, 3, 4]) {
    const w = world({ seed: 60 + n });
    const host = withBots(w.phone()); host.send({ t: 'create' });
    const all = [host]; for (let i = 1; i < n; i++) { const p = withBots(w.phone()); p.send({ t: 'join', code: host.room.code }); all.push(p); }
    host.send({ t: 'opt', key: 'mode', value: 'marathon' }); host.send({ t: 'opt', key: 'pool', value: [meta.id] }); host.send({ t: 'opt', key: 'rounds', value: 1 });
    host.send({ t: 'start' });
    assert.ok(w.run(5 * 60 * 1000, () => host.phase === 'game'));
    let best = 0; const t0 = w.now;
    assert.ok(w.run(5 * 60 * 1000, () => { const st = host.last.s?.g?.st; if (st) best = Math.max(best, ...Object.values(st).map(x => x[0])); return host.phase === 'results'; }), `${n}: results`);
    assert.ok(w.now - t0 <= (meta.seconds + 3) * 1000);
    assert.ok(best > 1000, `${n}: the bots scored (${best})`);
  }
});
