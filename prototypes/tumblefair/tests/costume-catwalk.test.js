import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, dealTray, DRESS_S, WALK_S, VOTE_S, REVEAL_S } from '../js/games/costume-catwalk/sim.js';
import { SLOTS, SLOT_IDS, PIECES, COLOURS, THEMES, POSES, TAGS, JUDGE_RULES, PLAIN, worn, themeFit, colourMatch, colourCount, judgeScore, soloScore, dressedAvatar } from '../js/games/costume-catwalk/pieces.js';
import { PARTS } from '../../../avatar-2d/js/parts/index.js';
import { world, withBots } from './helpers.js';

const mk = (n, seed = 5) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const until = (g, phase) => { for (let i = 0; i < 4000 && g.state().phase !== phase && !g.over; i++) g.step(0.05); assert.equal(g.state().phase, phase); };
const placed = r => r.order.flat().sort((a, b) => a - b);
const dress = (g, pid, picks) => { for (const [s, i] of Object.entries(picks)) g.act(pid, 'wear', { s, i }); };

test('the wardrobe: every piece is a real Chibi 2 part with known tags; 30+ themes; clean names', () => {
  assert.ok(PIECES.length >= 80, PIECES.length);
  for (const p of PIECES) {
    assert.ok(SLOT_IDS.includes(p.slot), p.name);
    assert.ok(p.tags.length >= 1 && p.tags.every(t => TAGS[t]), p.name);
    if (p.slot === 'hair') assert.match(p.part, /^#[0-9a-f]{6}$/);
    else assert.ok(PARTS[p.to]?.[p.part], `${p.name}: ${p.to}/${p.part} is in the part catalog`);
  }
  for (const s of SLOTS) assert.ok(PIECES.filter(p => p.slot === s.id).length >= s.deal + 2, `${s.id}: enough pieces to deal`);
  for (const k of Object.keys(PLAIN)) assert.ok(PARTS[k]?.[PLAIN[k].id], `plain ${k}`);
  assert.ok(THEMES.length >= 30); assert.equal(new Set(THEMES.map(t => t.name)).size, THEMES.length);
  for (const t of THEMES) {
    assert.equal(t.likes.length, 2); assert.ok(t.likes.every(x => TAGS[x]) && t.likes[0] !== t.likes[1], t.name);
    for (const like of t.likes) assert.ok(PIECES.filter(p => p.tags.includes(like)).length >= 8, `${t.name}: ${like} has pieces`);
  }
  for (const s of [...PIECES.map(p => p.name), ...THEMES.flatMap(t => [t.name, t.line]), ...POSES.map(p => p.name)]) assert.doesNotMatch(s, /muster|ember|veil/i, s);
  assert.ok(COLOURS.every(c => /^#[0-9a-f]{6}$/.test(c.hex) && c.name));
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
});

test('a tray deals different pieces per slot and always holds pieces that fit the theme', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const rng = makeRng(seed), theme = THEMES[seed % THEMES.length], tray = dealTray(rng, theme);
    for (const s of SLOTS) {
      assert.equal(tray[s.id].length, s.deal);
      assert.equal(new Set(tray[s.id].map(([p]) => p)).size, s.deal, 'no piece twice in a slot');
      for (const [p, c] of tray[s.id]) { assert.equal(PIECES[p].slot, s.id); assert.ok(c >= 0 && c < COLOURS.length); }
    }
    const fitSlots = SLOT_IDS.filter(s => tray[s].some(([p]) => PIECES[p].tags.some(t => theme.likes.includes(t))));
    assert.ok(fitSlots.length >= 4, `seed ${seed}: ${fitSlots.length} slots can fit ${theme.name}`);
  }
});

test('the scoring helpers measure what the screen says', () => {
  const theme = { likes: ['fancy', 'mighty'] };
  const crown = PIECES.findIndex(p => p.part === 'crown'), hoodie = PIECES.findIndex(p => p.part === 'hoodie'), plate = PIECES.findIndex(p => p.part === 'plate'), pink = PIECES.findIndex(p => p.name === 'Bubblegum Pink');
  const list = [[crown, 0], [hoodie, 0], [plate, 3], [pink, 0]];
  assert.equal(themeFit(theme, list), 2, 'crown and plate fit; hoodie and pink hair do not');
  assert.equal(colourMatch(list), 2, 'two gold pieces; hair dye does not count as a colour');
  assert.equal(colourCount(list), 2);
  assert.equal(judgeScore('theme', theme, list), 2); assert.equal(judgeScore('match', theme, list), 2); assert.equal(judgeScore('rainbow', theme, list), 2);
  assert.equal(soloScore(theme, list), 2);
  assert.equal(soloScore(theme, [[crown, 1], [plate, 1], [hoodie, 1]]), 2 + 2, 'three in one colour: +2');
  // the dressed avatar: plain clothes underneath, every worn piece on its slot, hair dye on the hair, base untouched
  const base = { hair: { id: 'long', color: '#111111' }, top: { id: 'robe', color: '#000000' }, held: { id: 'sword' } };
  const av = dressedAvatar(base, [[crown, 0], [pink, 0]]);
  assert.deepEqual(av.hat, { id: 'crown', color: COLOURS[0].hex });
  assert.equal(av.hair.id, 'long'); assert.equal(av.hair.color, '#ff7ab6');
  assert.equal(av.top.id, PLAIN.top.id); assert.equal(av.held.id, 'none');
  assert.equal(base.top.id, 'robe', 'the base look is not changed');
  assert.deepEqual(worn({ hat: [[crown, 2]], top: [[hoodie, 1]] }, { hat: 0, top: -1 }), [[crown, 2]]);
});

test('dressing is private and checked against your own tray', () => {
  const g = mk(3);
  const tray = g.priv(1).tray;
  dress(g, 1, { hat: 1, top: 0, prop: 2 });
  assert.deepEqual(worn(tray, g.priv(1).outfit), [tray.hat[1], tray.top[0], tray.prop[2]]);
  for (const d of [{ s: 'hat', i: 3 }, { s: 'hat', i: -2 }, { s: 'hat', i: 0.5 }, { s: 'wig', i: 0 }, { s: 'hat' }, 'hat', null, 7, { s: 'hat', i: '0' }]) g.act(1, 'wear', d);
  g.act(9, 'wear', { s: 'hat', i: 0 });
  assert.equal(g.priv(1).outfit.hat, 1, 'bad wears are ignored');
  g.act(1, 'wear', { s: 'hat', i: -1 }); assert.equal(g.priv(1).outfit.hat, -1, 'taking a piece off');
  for (const d of [-1, POSES.length, 1.5, '2']) g.act(1, 'pose', d);
  g.act(1, 'pose', 3); assert.equal(g.priv(1).pose, 3);
  assert.ok(!JSON.stringify(g.state()).includes('tray') && g.state().show === undefined, 'nothing about outfits in public until the runway');
  g.act(1, 'vote', 0); assert.equal(g.priv(1).vote, null, 'no voting while dressing');
});

test('everyone ready skips the wait; changing an outfit un-readies you', () => {
  const g = mk(2);
  g.act(1, 'done', true); dress(g, 1, { hat: 0 }); assert.equal(g.priv(1).done, false);
  g.act(1, 'done', true); g.act(2, 'done', true); run(g, 0.6);
  assert.equal(g.state().phase, 'runway');
});

test('the runway shows every outfit once, anonymous and shuffled, one model at a time', () => {
  const g = mk(4, 11);
  dress(g, 2, { hat: 0, top: 1, shoes: 2 });
  until(g, 'runway');
  const s = g.state();
  assert.equal(s.show.length, 4); assert.equal(s.walk, 0);
  assert.ok(!JSON.stringify(s.show).match(/pid|"P\d/), 'no names or pids on the runway');
  const mine = g.priv(2).mine; assert.equal(s.show[mine].o.length, 3);
  assert.deepEqual(s.show[mine].o, worn(g.priv(2).tray, g.priv(2).outfit));
  for (const e of s.show) { assert.ok(Array.isArray(e.m) && e.m.length === 2); assert.ok(Number.isInteger(e.pose)); }
  const walks = new Set(); for (let i = 0; i < 4000 && g.state().phase === 'runway'; i++) { walks.add(g.state().walk); g.step(0.05); }
  assert.deepEqual([...walks], [0, 1, 2, 3]); assert.equal(g.state().phase, 'vote');
});

test('votes: never your own; points = votes + one judge ribbon; ties share a place', () => {
  const g = mk(3, 21);
  dress(g, 1, { hat: 0, top: 0 }); dress(g, 2, { hat: 0 }); dress(g, 3, { hat: 1, top: 1, bottom: 1, shoes: 1 });
  until(g, 'vote');
  const m = p => g.priv(p).mine;
  g.act(1, 'vote', m(1)); assert.equal(g.priv(1).vote, null, 'own outfit refused');
  g.act(1, 'vote', 'both'); assert.equal(g.priv(1).vote, null, '"both" only with two players');
  g.act(1, 'vote', m(3)); g.act(2, 'vote', m(3)); g.act(3, 'vote', m(1));
  run(g, 1.2); assert.equal(g.state().phase, 'reveal', 'all voted: straight to the reveal');
  const r = g.state().reveal, sc = g.state().scores;
  assert.equal(r.got[3], 2); assert.equal(r.got[1], 1); assert.equal(r.got[2], 0);
  assert.ok([1, 2, 3].includes(r.ribbon));
  for (const p of [1, 2, 3]) assert.equal(sc[p], r.got[p] + (r.ribbon === p ? 1 : 0));
  run(g, REVEAL_S + 1); assert.ok(g.over);
  const res = g.result(); assert.deepEqual(placed(res), [1, 2, 3]); assert.equal(res.unit, 'points');
  for (let i = 1; i < res.order.length; i++) assert.ok(res.scores[res.order[i - 1][0]] > res.scores[res.order[i][0]]);
});

test('the ribbon follows the printed rule; a tie on the rule goes to whoever was ready first', () => {
  let checked = 0;
  for (let seed = 1; seed <= 60 && checked < 6; seed++) {
    const g = mk(2, seed), rule = g.init().judge.id, theme = g.init().theme;
    const t1 = g.priv(1).tray, t2 = g.priv(2).tray;
    // both wear the same number of pieces in the same slots, so the rule may tie; player 2 finishes first
    dress(g, 2, { hat: 0, top: 0 }); g.step(0.05); dress(g, 1, { hat: 0, top: 0 });
    until(g, 'vote'); g.act(1, 'vote', 'both'); g.act(2, 'vote', 'both'); until(g, 'reveal');
    const r = g.state().reveal, s1 = judgeScore(rule, theme, worn(t1, { hat: 0, top: 0 })), s2 = judgeScore(rule, theme, worn(t2, { hat: 0, top: 0 }));
    assert.equal(r.ribbon, s1 > s2 ? 1 : 2, `seed ${seed} ${rule}: ${s1} vs ${s2}`);
    assert.deepEqual(r.got, { 1: 2, 2: 2 }, '"both" from both players: two votes each');
    assert.equal(g.result().order.length, 2, 'the ribbon settles a two-player tie');
    checked++;
  }
  assert.equal(checked, 6);
  assert.deepEqual(JUDGE_RULES.map(r => r.id), ['theme', 'match', 'rainbow']);
});

test('solo practice: no vote, the judge scores the outfit against the theme by the printed rule', () => {
  const g = mk(1, 9), theme = g.init().theme, tray = g.priv(1).tray;
  assert.equal(g.init().solo, true);
  const pick = {}; for (const s of SLOT_IDS) pick[s] = 0; dress(g, 1, pick);
  g.act(1, 'done', true); run(g, 0.6); assert.equal(g.state().phase, 'runway');
  run(g, WALK_S + 0.1); assert.equal(g.state().phase, 'reveal', 'straight from the runway to the score');
  assert.equal(g.state().scores[1], soloScore(theme, worn(tray, pick)));
  run(g, REVEAL_S + 1); assert.ok(g.over); assert.deepEqual(g.result().order, [[1]]);
});

test('nobody does anything: ends inside meta.seconds for 1-4 players, everyone placed once', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 30 + n); let t = 0;
    for (; t < meta.seconds + 3 && !g.over; t += 0.05) g.step(0.05);
    assert.ok(g.over, `${n}: ended`); assert.ok(t <= meta.seconds, `${n}: ${t.toFixed(1)} s`);
    const r = g.result(); assert.deepEqual(placed(r), Array.from({ length: n }, (_, i) => i + 1));
    assert.ok(Object.values(r.scores).every(v => v === 0), 'nothing worn: nothing scores, no ribbon');
  }
  assert.ok(DRESS_S + WALK_S * 4 + VOTE_S + REVEAL_S + 2 <= meta.seconds);
});

test('the same seed deals the same game', () => {
  const a = mk(3, 77), b = mk(3, 77);
  assert.deepEqual(a.init(), b.init()); for (const p of [1, 2, 3]) assert.deepEqual(a.priv(p), b.priv(p));
  until(a, 'runway'); until(b, 'runway'); assert.deepEqual(a.state().show, b.state().show);
});

test('through the room with bot phones: 1-4 players reach the results before the clock', () => {
  for (const n of [1, 2, 3, 4]) {
    const w = world({ seed: 40 + n });
    const host = withBots(w.phone()); host.send({ t: 'create' });
    for (let i = 1; i < n; i++) withBots(w.phone()).send({ t: 'join', code: host.room.code });
    host.send({ t: 'opt', key: 'mode', value: 'marathon' }); host.send({ t: 'opt', key: 'pool', value: [meta.id] }); host.send({ t: 'opt', key: 'rounds', value: 1 });
    host.send({ t: 'start' });
    assert.ok(w.run(5 * 60 * 1000, () => host.phase === 'game'), 'the game starts');
    const t0 = w.now;
    assert.ok(w.run(5 * 60 * 1000, () => host.phase === 'results'), `${n}: results (stuck in ${host.phase})`);
    if (n > 1) assert.ok(w.now - t0 < meta.seconds * 1000, `${n}: bots finish early (${(w.now - t0) / 1000} s)`);
    assert.equal(host.last.phase.game ?? meta.id, meta.id);
  }
});
