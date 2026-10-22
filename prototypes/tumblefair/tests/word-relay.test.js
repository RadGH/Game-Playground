import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, why, clean, isWord, options, RULES, RULE, FIRST_BONUS, LINK_MAX_S, MIN_OPTIONS, GAME_S, GRACE } from '../js/games/word-relay/sim.js';
import { WORDS } from '../js/games/word-relay/words.js';

const LIST = WORDS.split(' ');
const mk = (n, seed = 4, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
// (the state shows only the last few words of the chain; in a test nobody empties `events`, so they hold every word scored)
const seen = new WeakMap();
const used = g => { const u = seen.get(g) || new Set(); seen.set(g, u); for (const c of g.state().chain) u.add(c[0]); for (const x of g.state().got) u.add(x[1]); for (const e of g.events) if (e.e === 'yes') u.add(e.w); return u; };
/** A word that is good for the current link (skipping `skip` of them), from the dictionary. */
const good = (g, skip = 0) => { const s = g.state(), u = used(g); return LIST.filter(w => !why(w, s.letter, s.rule, u))[skip]; };
const toNextLink = g => { const l = g.state().link; while (!g.over && g.state().link === l) g.step(0.05); };
const placed = r => r.order.flat().sort((a, b) => a - b);

test('the dictionary: compact, lower-case a-z, 3-12 letters, no repeats, nothing rude', () => {
  assert.ok(LIST.length >= 8000 && LIST.length <= 20000, `${LIST.length} words`);
  assert.ok(WORDS.length < 150000);
  assert.equal(new Set(LIST).size, LIST.length);
  assert.ok(LIST.every(w => /^[a-z]{3,12}$/.test(w)));
  for (const w of ['fuck', 'shit', 'cunt', 'bitch', 'porn', 'sex', 'nazi', 'rape', 'slut', 'whore', 'asshole', 'penis', 'prostitution']) assert.ok(!isWord(w), w);
  for (const w of ['table', 'river', 'happy', 'garden', 'music', 'yellow']) assert.ok(isWord(w), w);
});

test('the rules: what each one lets through', () => {
  assert.ok(RULE['no-e'].test('cat') && !RULE['no-e'].test('tree'));
  assert.ok(RULE.min6.test('garden') && !RULE.min6.test('table'));
  assert.ok(RULE.max4.test('tree') && !RULE.max4.test('trees'));
  assert.ok(RULE.double.test('apple') && !RULE.double.test('apricot'));
  assert.ok(RULE.vow3.test('banana') && !RULE.vow3.test('cart'));
  assert.ok(RULE['has-r'].test('car') && !RULE['has-r'].test('cat'));
  assert.ok(RULE['end-y'].test('happy'));
  for (const r of RULES) assert.ok(r.text && r.short && !/ember|veil|muster/i.test(r.text));
});

test('why a word is refused', () => {
  const u = new Set(['table']);
  assert.equal(why(clean('Tiger '), 't', 'any', u), null, 'case and outer spaces do not matter');
  assert.match(why(clean('apple'), 't', 'any', u), /start with T/);
  assert.match(why(clean('table'), 't', 'any', u), /already used/);
  assert.match(why(clean('tree'), 't', 'no-e', u), /breaks the rule/);
  assert.match(why(clean('tzzqx'), 't', 'any', u), /dictionary/);
  assert.match(why(clean('to'), 't', 'any', u), /3 letters/);
  assert.match(why(clean('t3st'), 't', 'any', u), /letters only/);
  assert.equal(clean('<b>'), null); assert.equal(clean(42), null);
});

test('every link asks for a letter + rule with plenty of answers, and the rule changes every two links', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = mk(2, seed); const rules = [];
    while (!g.over) {
      const s = g.state();
      if (s.phase === 'go' && rules[s.link] == null) {
        rules[s.link] = s.rule;
        assert.ok(options(s.letter, s.rule, used(g), MIN_OPTIONS) >= MIN_OPTIONS, `seed ${seed} link ${s.link}: ${s.letter}/${s.rule}`);
        assert.ok(s.prev.includes(s.letter), 'the letter comes from the word before');
        const w = good(g, seed % 3); g.act(1, 'word', w);
        assert.equal(g.state().got.length, 1, `accepted ${w}`);
      }
      g.step(0.05);
    }
    assert.equal(rules[0], 'any');
    assert.ok(rules.length >= 5, `seed ${seed}: ${rules.length} links in a minute`);
    assert.notEqual(rules[2], rules[1], 'a new rule at the third link');
  }
});

test('scoring: length, +3 for the first, others can still score in the grace window, then the chain moves on', () => {
  const g = mk(3, 5); const s = g.state();
  const a = good(g, 0), b = good(g, 1);
  g.act(2, 'word', a);
  assert.equal(g.state().pts[2], a.length + FIRST_BONUS);
  g.step(0.05); g.act(3, 'word', a);                       // the same word: taken
  assert.equal(g.state().pts[3], 0);
  for (let i = 0; i < 10; i++) g.step(0.05);
  g.act(3, 'word', b);
  assert.equal(g.state().pts[3], b.length, 'second good word: its length, no bonus');
  g.act(2, 'word', good(g, 2)); assert.equal(g.state().pts[2], a.length + FIRST_BONUS, 'one word a link each');
  toNextLink(g);
  const n = g.state();
  assert.equal(n.link, s.link + 1); assert.equal(n.prev, a, 'the first word is the new link');
  assert.ok(a.includes(n.letter));
  assert.equal(n.chain.at(-1)[0], a); assert.equal(n.chain.at(-1)[1], 2);
});

test('everyone in closes the link early; nobody in 14 s gives a new letter', () => {
  const g = mk(2, 8);
  g.act(1, 'word', good(g, 0)); g.step(0.05); g.act(2, 'word', good(g, 1));
  let t = 0; const l = g.state().link; while (g.state().link === l) { g.step(0.05); t += 0.05; }
  assert.ok(t < GRACE.normal, `closed after ${t.toFixed(2)} s`);
  const h = mk(2, 8); const p0 = h.state().prev; t = 0;
  while (h.state().phase === 'go') { h.step(0.05); t += 0.05; }
  assert.ok(Math.abs(t - LINK_MAX_S) < 0.1);
  toNextLink(h);
  assert.notEqual(h.state().prev, p0); assert.equal(h.state().chain.at(-1)[2], 1, 'marked as skipped');
});

test('spam is slowed and junk is refused without a crash', () => {
  const g = mk(2, 3);
  for (const d of [null, 5, {}, [], 'x'.repeat(500), '<script>', '', 'zzz']) g.act(1, 'word', d);
  g.act(9, 'word', good(g)); g.act(1, 'nope', good(g));
  assert.equal(g.state().got.length, 0);
  const ev = g.events.filter(e => e.to === 1);
  assert.ok(ev.some(e => /slow down/.test(e.why)), 'second try within 0.4 s is slowed');
  for (let i = 0; i < 10; i++) g.step(0.05);
  g.act(1, 'word', good(g)); assert.equal(g.state().got.length, 1);
});

test('alone you race Quill, who answers on his own; the result only places you', () => {
  const g = mk(1, 2); run(g, 10);
  assert.ok(g.state().got.some(x => x[0] === 'cpu') || g.state().chain.some(c => c[1] === 'cpu'), 'Quill answered');
  run(g, 80);
  assert.ok(g.over);
  const r = g.result(); assert.deepEqual(r.order, [[1]]); assert.deepEqual(Object.keys(r.scores), ['1']);
  assert.ok(g.state().pts.cpu > 0);
});

test('results: by points, ties share a place, everyone once, ends at the clock', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 11); let t = 0;
    while (!g.over) { const s = g.state(); if (s.phase === 'go' && !s.got.length) { const w = good(g, 0); g.act(1 + (s.link % n), 'word', w); } g.step(0.05); t += 0.05; }
    assert.ok(Math.abs(t - GAME_S) < 0.1);
    const r = g.result();
    assert.deepEqual(placed(r), Array.from({ length: n }, (_, i) => i + 1));
    for (let i = 1; i < r.order.length; i++) assert.ok(r.scores[r.order[i - 1][0]] > r.scores[r.order[i][0]]);
    for (const grp of r.order) assert.equal(new Set(grp.map(p => r.scores[p])).size, 1);
  }
  const tie = mk(3, 1).result(); assert.deepEqual(tie.order, [[1, 2, 3]], 'nobody scored: all tied');
});

test('meta is sane and the changing state is small', () => {
  assert.equal(meta.kind, 'ui'); assert.equal(meta.min, 1); assert.equal(meta.max, 4); assert.equal(meta.seconds, 60);
  assert.ok(!/ember|veil|muster/i.test(JSON.stringify(meta)));
  assert.ok(JSON.stringify(mk(4).state()).length < 400);
});
