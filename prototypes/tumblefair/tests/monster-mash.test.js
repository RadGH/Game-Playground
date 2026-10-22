import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeChart, scoreOf, maxScore, mult, stepSec, COUNT_S, END_S, BPM, PATTERNS, MOVES, LATE_MISS, EARLY } from '../js/games/monster-mash/sim.js';
import { readFileSync } from 'node:fs';
// the clip names every character is built with (avatars.js ANIMS = Chibi 2's base clips + its emotes + three extras);
// read as text because those modules need three.js, which node tests do not load
const MOTION = readFileSync(new URL('../../../avatar-3d/js/chibi2-motion.js', import.meta.url), 'utf8');
const listOf = name => JSON.parse(MOTION.match(new RegExp(`export const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const ANIMS = [...listOf('CHIBI2_ANIMS'), ...listOf('CHIBI2_EMOTE_ANIMS'), 'throw', 'punch', 'kick'];
import { eligible } from '../js/games/index.js';
import { world, withBots } from './helpers.js';

const mk = (n, seed = 5, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty, season: 'halloween' });
const placed = r => r.order.flat().sort((a, b) => a - b);
const toPlay = g => { while (g.state().phase === 'count') g.step(0.05); };
const playTo = (g, sec) => { toPlay(g); let el = 0; while (el + 0.05 <= sec + 1e-9) { g.step(0.05); el += 0.05; } };

test('meta: a Halloween holiday game, offered only in its season; every move is a real dance clip', () => {
  assert.equal(meta.season, 'halloween'); assert.ok(meta.tags.includes('holiday'));
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
  assert.ok(!eligible(3, [], null).includes(meta.id)); assert.ok(eligible(3, [], 'halloween').includes(meta.id)); assert.ok(eligible(1, [], 'halloween').includes(meta.id));
  assert.equal(MOVES.length, 4); assert.deepEqual(MOVES.map(m => m.arrow).sort(), ['down', 'left', 'right', 'up']);
  for (const m of MOVES) assert.ok(ANIMS.includes(m.clip), `${m.clip} is a clip every character has`);
  for (const c of ['shrug', 'cheer', 'bowGreet', 'dance']) assert.ok(ANIMS.includes(c));
});

test('the chart: same seed same chart; four sections that get busier; all four buttons used; never 4 of one button in a row; fits the clock', () => {
  for (const d of ['easy', 'normal', 'hard']) for (let seed = 1; seed <= 30; seed++) {
    const a = makeChart(makeRng(seed), d);
    assert.deepEqual(a, makeChart(makeRng(seed), d));
    assert.equal(a.bpm, BPM[d]); assert.equal(a.steps.length, a.lanes.length);
    assert.ok(a.steps.every((s, i) => i === 0 || s > a.steps[i - 1]));
    assert.ok(a.steps[0] >= 8, 'a lead-in bar with no arrows');
    assert.equal(a.steps.at(-1), (a.bars - 1) * 8);
    assert.ok(a.lanes.every(l => l >= 0 && l <= 3)); assert.equal(new Set(a.lanes).size, 4);
    for (let i = 3; i < a.lanes.length; i++) assert.ok(!(a.lanes[i] === a.lanes[i - 1] && a.lanes[i] === a.lanes[i - 2] && a.lanes[i] === a.lanes[i - 3]), `seed ${seed}: four in a row at ${i}`);
    assert.equal(a.sec.length, 4);
    const song = a.bars * 8 * stepSec(a.bpm);
    assert.ok(song <= 36.5 && song >= 32, `${d}: ${song.toFixed(1)} s`);
    assert.ok(COUNT_S + song + 0.6 + END_S + 1 <= meta.seconds);
    const per = lv => { const from = a.sec[lv] * 8, to = (a.sec[lv + 1] ?? a.bars - 1) * 8; return a.steps.filter(s => s >= from && s < to).length / ((to - from) / 8); };
    assert.ok(per(3) > per(0), `${d} seed ${seed}: the finale is busier`);
  }
  for (const level of PATTERNS) for (const p of level) assert.match(p, /^[x.]{8}$/);
});

test('scoring: perfect 100, good 50, the combo multiplies, a miss or a stray breaks it', () => {
  const chart = { bpm: 120, bars: 4, steps: Array.from({ length: 20 }, (_, i) => 8 + i), lanes: Array(20).fill(0), sec: [1, 1, 2, 3] };
  assert.equal(mult(7), 1); assert.equal(mult(8), 2); assert.equal(mult(99), 4);
  assert.equal(maxScore(chart), 8 * 100 + 8 * 200 + 4 * 300);
  const gap = new Map(chart.steps.map((x, i) => [i, 0])); gap.delete(8);
  const sg = scoreOf(chart, gap, new Set()); assert.equal(sg.miss, 1); assert.equal(sg.best, 11);
  assert.equal(scoreOf(chart, new Map(chart.steps.map((x, i) => [i, 0])), new Set([8])).best, 12, 'a stray before arrow 8 breaks the combo');
  assert.equal(scoreOf(chart, new Map([[0, 0]]), new Set(), (9) * stepSec(120) + LATE_MISS - 0.01).miss, 0, 'arrows still to come are not misses yet');
});

test('the server only takes judgements that could have happened; the last move is shown to everyone', () => {
  const g = mk(2), ch = g.init().chart, t = n => ch.steps[n] * stepSec(ch.bpm);
  g.act(1, 'hit', { n: 0, q: 0 }); toPlay(g);
  assert.equal(g.state().st[1][2], 0, 'nothing before the music');
  playTo(g, t(0) - EARLY + 0.06);
  g.act(1, 'hit', { n: 0, q: 0 }); g.act(1, 'hit', { n: 0, q: 1 });
  assert.deepEqual(g.state().st[1].slice(2, 4), [1, 0], 'once, the first verdict stands');
  assert.deepEqual(g.state().mv[1], [0, ch.lanes[0]], 'everyone sees which move player 1 just danced');
  assert.deepEqual(g.state().mv[2], [-1, -1]);
  for (const d of [{ n: 1.5, q: 0 }, { n: -1, q: 0 }, { n: 999, q: 0 }, { n: 1, q: 2 }, 'x', null, 1]) g.act(1, 'hit', d);
  g.act(1, 'hit', { n: 9, q: 0 }); assert.equal(g.state().st[1][2], 1, 'a far-future arrow is refused');
  g.act(2, 'stray', 1); g.act(2, 'stray', 1); g.act(2, 'stray', 40); g.act(2, 'stray', 'a'); g.act(7, 'hit', { n: 0, q: 0 });
  playTo(g, 0.3); g.act(2, 'hit', { n: 0, q: 1 });
  assert.equal(g.state().st[2][3], 1, 'a late verdict (the network) is fine');
});

test('a perfect dancer beats a sloppy one; ties share; everyone placed once; solo works', () => {
  const g = mk(4, 13), ch = g.init().chart, ss = stepSec(ch.bpm);
  toPlay(g); let el = 0;
  for (let n = 0; n < ch.steps.length; n++) {
    while (el < ch.steps[n] * ss + 0.1) { g.step(0.05); el += 0.05; }
    g.act(1, 'hit', { n, q: 0 }); g.act(2, 'hit', { n, q: 0 });
    if (n % 2) g.act(3, 'hit', { n, q: 1 });
  }
  while (!g.over) g.step(0.05);
  const r = g.result();
  assert.deepEqual(placed(r), [1, 2, 3, 4]);
  assert.deepEqual(r.order[0].sort(), [1, 2]); assert.deepEqual(r.order[1], [3]); assert.deepEqual(r.order[2], [4]);
  assert.equal(r.scores[1], maxScore(ch)); assert.equal(r.scores[4], 0);
  const s = mk(1, 2); while (!s.over) s.step(0.05);
  assert.deepEqual(s.result().order, [[1]]); assert.equal(s.init().solo, true);
});

test('ends by itself within meta.seconds for 1-4 players and every difficulty', () => {
  for (let n = 1; n <= 4; n++) for (const d of ['easy', 'normal', 'hard']) {
    const g = mk(n, 20 + n, d); let t = 0;
    while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over); assert.ok(t <= meta.seconds, `${t}`);
    assert.deepEqual(placed(g.result()), Array.from({ length: n }, (_, i) => i + 1));
  }
});

test('the room plays whole matches of it with bots (Halloween forced on)', () => {
  for (const n of [1, 3]) {
    const W = world({ seed: 40 + n }), ph = [withBots(W.phone())];
    ph[0].send({ t: 'create' }); const code = ph[0].room.code;
    for (let i = 1; i < n; i++) { const p = withBots(W.phone()); p.send({ t: 'join', code }); ph.push(p); }
    ph[0].send({ t: 'opt', key: 'holiday', value: 'halloween' }); ph[0].send({ t: 'opt', key: 'mode', value: 'marathon' }); ph[0].send({ t: 'opt', key: 'pool', value: [meta.id] }); ph[0].send({ t: 'opt', key: 'rounds', value: 1 });
    ph[0].send({ t: 'start' });
    assert.ok(W.run(5 * 60 * 1000, () => ph[0].phase === 'results'), `${n}: reached results`);
    const res = ph[0].last.phase.result;
    assert.equal(ph[0].last.phase.game, meta.id); assert.equal(res.order.flat().length, n);
    assert.ok(Object.values(res.scores).every(v => v > 1000), `bots danced: ${JSON.stringify(res.scores)}`);
  }
});
