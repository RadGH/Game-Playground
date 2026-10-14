import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, SCENES, OPENERS, cleanCaption, judgeScore, MAX_LEN, WRITE_S, VOTE_S, REVEAL_S } from '../js/games/caption-clash/sim.js';
import { PROPS, BACKDROPS } from '../js/games/caption-clash/kit.js';

const mk = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const step = g => g.step(0.05);
const write = (g, pid, text) => { g.act(pid, 'cap', text); g.act(pid, 'done', true); };
const placed = r => r.order.flat().sort((a, b) => a - b);
const toVote = g => { run(g, 1); assert.equal(g.state().phase, 'vote'); };
const indexOf = (g, pid) => g.priv(pid).mine;

test('the scene file: about 40 clean scenes, every prop and backdrop drawn, and openers', () => {
  assert.ok(SCENES.length >= 38, SCENES.length);
  assert.equal(new Set(SCENES.map(s => s.id)).size, SCENES.length);
  for (const s of SCENES) {
    assert.ok(s.text.length > 10 && s.text.length < 70, s.text);
    assert.ok(BACKDROPS[s.bg], `${s.id}: backdrop ${s.bg}`);
    assert.ok(s.props.length >= 1);
    for (const [id, x, y, k] of s.props) { assert.ok(PROPS[id], `${s.id}: prop ${id}`); assert.ok(x >= 0 && x <= 160 && y >= 0 && y <= 100 && k > 0); }
    assert.doesNotMatch(s.text, /muster|ember|veil/i);
  }
  assert.ok(OPENERS.length >= 12); assert.equal(new Set(OPENERS).size, OPENERS.length);
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
});

test('captions are cleaned: no markup, single spaces, 80 letters at most', () => {
  assert.equal(cleanCaption('  <b>Hello</b>\n\n   world  '), 'Hello world');
  assert.equal(cleanCaption('a <script>alert(1)</script> b'), 'a alert(1) b');
  assert.equal(cleanCaption('x < y > z'), 'x z', 'anything that looks like a tag goes'); assert.equal(cleanCaption('1 < 2'), '1 2');
  assert.equal(cleanCaption('tab\there\u0000now‮'), 'tab here now');
  assert.equal(cleanCaption('a'.repeat(200)).length, MAX_LEN);
  assert.equal(cleanCaption(5), ''); assert.equal(cleanCaption(null), ''); assert.equal(cleanCaption('   '), '');
});

test('the judge rules measure what they say', () => {
  assert.ok(judgeScore('short', 'hi') > judgeScore('short', 'hello'));
  assert.equal(judgeScore('allit', 'Big bad Bob ate apples'), 3);
  assert.equal(judgeScore('words', "it's a goat, mayor"), 4);
});

test('everyone sees the same scene; captions travel only to their writer until the vote', () => {
  const g = mk(3), h = mk(3);
  assert.deepEqual(g.init().scene, h.init().scene, 'same seed, same scene');
  g.act(1, 'cap', 'A secret caption');
  assert.equal(g.priv(1).cap, 'A secret caption');
  assert.ok(!JSON.stringify(g.state()).includes('secret'), 'not in the public state while writing');
  assert.ok(!JSON.stringify(g.priv(2)).includes('secret'));
  assert.equal(g.priv(1).starters.length, 3);
  const s0 = g.priv(1).starters; g.act(1, 'starter'); assert.notDeepEqual(g.priv(1).starters, s0, 'asking again offers three others');
  for (const s of g.priv(1).starters) assert.ok(OPENERS.includes(s));
});

test('done needs a caption; editing after done clears it; everyone done skips ahead', () => {
  const g = mk(2);
  g.act(1, 'done', true); assert.equal(g.priv(1).done, false, 'nothing written yet');
  write(g, 1, 'One'); assert.equal(g.priv(1).done, true);
  g.act(1, 'cap', ''); assert.equal(g.priv(1).done, false, 'emptied: not done');
  write(g, 1, 'One'); write(g, 2, 'Two');
  toVote(g);
  assert.deepEqual([...g.state().caps].sort(), ['One', 'Two']);
});

test('votes: never your own, junk refused, points = votes + one judge ribbon', () => {
  const g = mk(4, 9);
  write(g, 1, 'Short'); write(g, 2, 'A much longer caption here'); write(g, 3, 'Medium one'); write(g, 4, 'Also medium');
  toVote(g);
  const cap = p => indexOf(g, p);
  g.act(1, 'vote', cap(1)); assert.equal(g.priv(1).vote, null, 'not your own');
  for (const d of [-1, 4, 1.5, '0', null, 'both', { i: 0 }]) g.act(1, 'vote', d);
  g.act(9, 'vote', 0); g.act(1, 'cap', 'late');
  assert.equal(g.priv(1).vote, null);
  g.act(1, 'vote', cap(2)); g.act(3, 'vote', cap(2)); g.act(4, 'vote', cap(2)); g.act(2, 'vote', cap(3));
  g.act(1, 'vote', cap(3)); g.act(1, 'vote', cap(2));                        // change of mind is fine
  run(g, VOTE_S);
  const s = g.state(); assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.reveal.got, { 1: 0, 2: 3, 3: 1, 4: 0 });
  const rule = g.init().judge.id, best = { short: 1, words: 2, allit: null }[rule];
  assert.ok(s.reveal.ribbon != null, 'exactly one ribbon');
  if (best) assert.equal(s.reveal.ribbon, best, rule);
  for (const p of [1, 2, 3, 4]) assert.equal(s.scores[p], s.reveal.got[p] + (s.reveal.ribbon === p ? 1 : 0));
  run(g, REVEAL_S + 1); assert.ok(g.over);
  const r = g.result(); assert.deepEqual(placed(r), [1, 2, 3, 4]); assert.equal(r.order[0][0], 2);
});

test('two players: a tie on votes is settled by the printed judge rule, then by who finished first', () => {
  for (let seed = 1; seed < 12; seed++) {
    const g = mk(2, seed), rule = g.init().judge.id;
    // same length, same word count, same alliteration: only the finishing order separates them
    g.act(2, 'cap', 'Goats rule'); step(g); step(g); g.act(1, 'cap', 'Cats drool'); g.act(1, 'done', true); g.act(2, 'done', true);
    toVote(g);
    g.act(1, 'vote', indexOf(g, 2)); g.act(2, 'vote', indexOf(g, 1));
    run(g, 2);
    const s = g.state(); assert.equal(s.phase, 'reveal');
    assert.equal(s.reveal.ribbon, 2, `${rule}: a tie on the rule goes to whoever wrote first`);
    const r = g.result(); assert.deepEqual(r.order, [[2], [1]]); assert.deepEqual(r.scores, { 1: 1, 2: 2 });
  }
  const g = mk(2, 4); write(g, 1, 'a'); write(g, 2, 'b'); toVote(g);
  g.act(1, 'vote', 'both'); g.act(2, 'vote', 'both'); run(g, 2);
  assert.deepEqual(g.state().reveal.got, { 1: 2, 2: 2 }, '"both are great" gives each a point');
});

test('solo: practice round, 1 point for a caption, 0 for none, no vote', () => {
  const g = mk(1); write(g, 1, 'Me, alone'); run(g, 1);
  assert.equal(g.state().phase, 'reveal'); assert.deepEqual(g.state().caps, ['Me, alone']);
  run(g, meta.seconds); assert.ok(g.over); assert.deepEqual(g.result(), { order: [[1]], scores: { 1: 1 }, unit: 'points' });
  const h = mk(1); run(h, meta.seconds); assert.ok(h.over); assert.deepEqual(h.result().scores, { 1: 0 });
});

test('nobody types anything: it ends by itself inside meta.seconds, everyone tied on 0', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, n + 20); run(g, meta.seconds);
    assert.ok(g.over, `${n} players end by themselves`);
    const r = g.result(); assert.deepEqual(r.order, [Array.from({ length: n }, (_, i) => i + 1)]); assert.ok(Object.values(r.scores).every(v => v === 0));
  }
  assert.ok(WRITE_S + VOTE_S + REVEAL_S + 3 <= meta.seconds);
  const g = mk(3); write(g, 2, 'Only me'); run(g, meta.seconds); assert.ok(g.over);
  assert.deepEqual(placed(g.result()), [1, 2, 3]);
  assert.equal(g.result().scores[2], 1, 'the only caption gets the ribbon; nobody else can vote for it but the two others');
});

test('a draft that was never submitted still counts; result() mid-game is valid', () => {
  const g = mk(3); g.act(1, 'cap', 'never pressed submit'); g.act(2, 'cap', 'me neither');
  assert.deepEqual(placed(g.result()), [1, 2, 3]);
  run(g, WRITE_S + 0.1); assert.equal(g.state().phase, 'vote'); assert.equal(g.state().caps.length, 2);
});

test('state only changes when something changes and stays small; junk acts are ignored', () => {
  const g = mk(4); for (const p of [1, 2, 3, 4]) write(g, p, 'x'.repeat(80));
  for (const [a, d] of [['cap', 5], ['cap', 'x'.repeat(401)], ['done', 'yes'], ['nope', 1], ['vote', 0]]) g.act(1, a, d);
  assert.equal(g.priv(1).cap, 'x'.repeat(80));
  run(g, 1); const s0 = JSON.stringify(g.state()); step(g); assert.equal(JSON.stringify(g.state()), s0);
  assert.ok(s0.length < 500, s0.length);
});
