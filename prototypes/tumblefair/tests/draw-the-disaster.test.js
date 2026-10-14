import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, PROMPTS, MAX_POINTS, MAX_STROKES, MAX_CHUNK, DRAW_S, VOTE_S, measure, ERASER } from '../js/games/draw-the-disaster/sim.js';

const mk = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const line = (x0, y0, x1, y1, n = 8) => Array.from({ length: n }, (_, i) => [Math.round(x0 + (x1 - x0) * i / (n - 1)), Math.round(y0 + (y1 - y0) * i / (n - 1))]).map(([x, y]) => x.toString(16).padStart(2, '0') + y.toString(16).padStart(2, '0')).join('');
const toVote = g => { for (const p of [1, 2, 3, 4]) g.act(p, 'done', true); run(g, 1); assert.equal(g.state().phase, g.init().solo ? 'reveal' : 'vote'); };
const placed = r => r.order.flat().sort();

test('the prompt file: at least 120 different, clean prompts', () => {
  assert.ok(PROMPTS.length >= 120, PROMPTS.length);
  assert.equal(new Set(PROMPTS).size, PROMPTS.length, 'no repeats');
  for (const p of PROMPTS) { assert.ok(p.length > 6 && p.length < 60, p); assert.doesNotMatch(p, /muster|ember|veil/i); }
});

test('everyone gets a different private prompt; the public state never shows it', () => {
  const g = mk(4);
  const ps = [1, 2, 3, 4].map(p => g.priv(p).prompt);
  assert.equal(new Set(ps).size, 4);
  for (const p of ps) assert.ok(!JSON.stringify(g.state()).includes(p));
  assert.deepEqual(mk(4).priv(2), g.priv(2), 'same seed, same prompts');
});

test('strokes: new, continued in chunks, undo, clear, and junk refused', () => {
  const g = mk(2);
  g.act(1, 'ink', { s: 1, c: 1, w: 0, p: line(0, 0, 50, 50) });
  g.act(1, 'ink', { s: 1, c: 1, w: 0, p: line(50, 50, 90, 10) });        // the same stroke, next chunk
  assert.equal(g.priv(1).n, 1);
  g.act(1, 'ink', { s: 2, c: 5, w: 1, p: line(10, 200, 200, 200) });
  assert.equal(g.priv(1).n, 2); assert.equal(g.state().n[1], 2);
  for (const bad of [null, 5, 'x', [], { s: 3, c: 99, w: 0, p: '0000' }, { s: 3, c: 1, w: 2, p: '0000' }, { s: 3, c: 1, w: 0, p: '00' }, { s: 3, c: 1, w: 0, p: 'zzzz' },
    { s: 3, c: 1, w: 0, p: '' }, { s: -1, c: 1, w: 0, p: '0000' }, { s: 1.5, c: 1, w: 0, p: '0000' }, { s: 3, c: 1, w: 0, p: '0000'.repeat(MAX_CHUNK + 1) }, { s: 1, c: 1, w: 0, p: '0000' }])
    g.act(1, 'ink', bad);
  assert.equal(g.priv(1).n, 2, 'nothing junk was added, and an old stroke id cannot be reopened');
  g.act(9, 'ink', { s: 5, c: 1, w: 0, p: '0000' });           // not a player
  g.act(1, 'paint', 1); g.act(1, 'vote', 0);                   // wrong verbs for this phase
  g.act(1, 'undo'); assert.equal(g.priv(1).n, 1);
  g.act(1, 'ink', { s: 2, c: 1, w: 0, p: '1010' });           // a late chunk of the undone stroke does not join stroke 1
  assert.equal(g.priv(1).n, 1);
  g.act(1, 'clear'); assert.equal(g.priv(1).n, 0);
  g.act(1, 'undo'); assert.equal(g.priv(1).n, 0, 'undo on an empty page is harmless');
});

test('a drawing is capped in points and strokes', () => {
  const g = mk(1);
  let s = 0;
  while (s < 40) g.act(1, 'ink', { s: ++s, c: 0, w: 0, p: '0000'.repeat(MAX_CHUNK) });
  assert.equal(g.priv(1).full, true);
  const n0 = g.priv(1).n; g.act(1, 'ink', { s: ++s, c: 0, w: 0, p: '1111' });
  assert.equal(g.priv(1).n, n0, 'a full page takes no new stroke');
  assert.ok(g.priv(1).n <= Math.ceil(MAX_POINTS / MAX_CHUNK));
  const h = mk(1);
  for (let i = 1; i <= MAX_STROKES + 20; i++) h.act(1, 'ink', { s: i, c: 0, w: 0, p: '0101' });
  assert.equal(h.priv(1).n, MAX_STROKES);
});

test('solo: a practice round, 1 point for drawing anything, 0 for nothing', () => {
  const g = mk(1); g.act(1, 'ink', { s: 1, c: 2, w: 1, p: line(0, 0, 100, 100) });
  toVote(g); assert.equal(g.state().phase, 'reveal');
  run(g, 30); assert.ok(g.over);
  assert.deepEqual(g.result().scores, { 1: 1 });
  const e = mk(1); run(e, meta.seconds); assert.ok(e.over, 'ends by itself');
  assert.deepEqual(e.result(), { order: [[1]], scores: { 1: 0 }, unit: 'points' });
});

test('nobody touches anything: it still ends inside meta.seconds with everyone placed on 0', () => {
  for (const n of [2, 3, 4]) {
    const g = mk(n); run(g, meta.seconds); assert.ok(g.over, `${n} players`);
    const r = g.result(); assert.deepEqual(placed(r), Array.from({ length: n }, (_, i) => i + 1));
    assert.ok(Object.values(r.scores).every(v => v === 0)); assert.equal(r.order.length, 1, 'all tied');
  }
  assert.ok(DRAW_S + VOTE_S + 9 <= meta.seconds);
});

test('the gallery: every picture goes out once, anonymous; you cannot vote for your own or a blank one', () => {
  const g = mk(3);
  g.act(1, 'ink', { s: 1, c: 1, w: 0, p: line(0, 0, 200, 0) });
  g.act(2, 'ink', { s: 1, c: 2, w: 0, p: line(0, 0, 0, 200) });
  toVote(g);
  const ev = g.events.find(e => e.e === 'art'); assert.ok(ev); assert.equal(ev.art.length, 3);
  assert.ok(!JSON.stringify(ev).includes('"pid"'), 'no artist named before the reveal');
  assert.deepEqual(g.init().art, ev.art, 'a phone that comes back mid-vote gets the gallery');
  const idx = p => g.priv(p).mine;
  g.act(1, 'vote', idx(1)); assert.equal(g.priv(1).vote, null, 'not your own');
  g.act(1, 'vote', idx(3)); assert.equal(g.priv(1).vote, null, 'not a blank page');
  g.act(1, 'vote', 'both'); assert.equal(g.priv(1).vote, null, '"both" is only for a pair');
  g.act(1, 'vote', 7); g.act(1, 'vote', -1); g.act(1, 'vote', '1');
  assert.equal(g.priv(1).vote, null);
  g.act(1, 'vote', idx(2)); g.act(2, 'vote', idx(1)); g.act(3, 'vote', idx(1));
  run(g, 2); assert.equal(g.state().phase, 'reveal', 'everyone voted: no waiting');
  const r = g.state().reveal; assert.deepEqual(r.got, { 1: 2, 2: 1, 3: 0 });
  run(g, 20); assert.ok(g.over);
  const res = g.result();
  assert.equal(res.order[0][0], 1); assert.deepEqual(placed(res), [1, 2, 3]);
});

test('2 players: vote for the other or "both"; the judge rule is stated and settles a tie', () => {
  for (let seed = 1; seed < 12; seed++) {
    const g = mk(2, seed);
    g.act(1, 'ink', { s: 1, c: 1, w: 1, p: line(0, 0, 250, 250, 30) });         // lots of ink, one colour
    g.act(2, 'ink', { s: 1, c: 2, w: 0, p: line(0, 0, 10, 10) });
    g.act(2, 'ink', { s: 2, c: 3, w: 0, p: line(20, 20, 30, 30) });
    g.act(2, 'ink', { s: 3, c: 4, w: 0, p: line(40, 40, 50, 50) });              // three colours, three strokes
    toVote(g);
    g.act(1, 'vote', g.priv(2).mine); g.act(2, 'vote', 'both');
    run(g, 2);
    const s = g.state(); assert.equal(s.phase, 'reveal');
    const want = s.judge === 'ink' ? [1] : [2];
    assert.deepEqual(s.reveal.ribbon, want, `rule ${s.judge}`);
    assert.deepEqual(s.reveal.got, { 1: 1, 2: 2 }, 'both = a point each');
    run(g, 20);
    assert.deepEqual(g.result().scores, { 1: 1 + (want[0] === 1), 2: 2 + (want[0] === 2) });
  }
});

test('ties share a place; the judge can give a ribbon to a tie', () => {
  const g = mk(4, 5);
  for (const p of [1, 2, 3, 4]) g.act(p, 'ink', { s: 1, c: 1, w: 0, p: line(0, 0, 100, 0) });
  toVote(g);
  const m = p => g.priv(p).mine;
  g.act(1, 'vote', m(2)); g.act(2, 'vote', m(1)); g.act(3, 'vote', m(4)); g.act(4, 'vote', m(3));
  run(g, 30);
  const r = g.result();
  assert.deepEqual(r.order, [[1, 2, 3, 4]], 'identical pictures, one vote each: everyone ties');
  assert.ok(Object.values(r.scores).every(v => v === 2), 'one vote + a shared ribbon');
});

test('measure counts colours without the rubber, ink by length and brush', () => {
  const a = measure([[1, 0, line(0, 0, 100, 0)], [ERASER, 1, line(0, 0, 100, 0)], [2, 1, '0000']]);
  assert.equal(a.colours, 2); assert.equal(a.strokes, 2);
  assert.ok(a.ink > 400 && a.ink < 500, a.ink);
});

test('state stays small and only changes when something happens', () => {
  const g = mk(4);
  const s0 = JSON.stringify(g.state()); g.step(0.05); assert.equal(JSON.stringify(g.state()), s0, 'nothing happened inside the same second');
  for (const p of [1, 2, 3, 4]) g.act(p, 'ink', { s: 1, c: 1, w: 0, p: line(0, 0, 255, 255, 400) });
  assert.ok(JSON.stringify(g.state()).length < 200);
});

test('a phone that comes back mid-drawing is handed its strokes and its last stroke id', async () => {
  const g = create({ seed: 1, rng: makeRng(9), players: [{ pid: 1, seat: 0, name: 'A' }, { pid: 2, seat: 1, name: 'B' }], difficulty: 'normal' });
  g.act(1, 'ink', { s: 1, c: 0, w: 0, p: '10101111' });
  g.act(1, 'ink', { s: 2, c: 2, w: 1, p: '20202121' });
  const r = g.restore(1);
  assert.equal(r.strokes.length, 2); assert.equal(r.sid, 2);
  assert.deepEqual(g.restore(2).strokes, []);
});
