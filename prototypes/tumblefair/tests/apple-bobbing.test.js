import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeApples, appleX, settle, bite, newLane, ZONE, COUNT_S, PLAY_S, END_S, LAG_S, AHEAD_S, NEXT_S, SPLASH_S, YUCK_S, SPIDER_LIFE, APPLES } from '../js/games/apple-bobbing/sim.js';
import { eligible } from '../js/games/index.js';
import { world, withBots } from './helpers.js';

const mk = (n, seed = 5, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + (i + 1) })), difficulty, season: 'halloween' });
const placed = r => r.order.flat().sort((a, b) => a - b);
const toPlay = g => { while (g.state().phase === 'count') g.step(0.05); };
/** Step the game until the server clock reads `t` (play time). */
const until = (g, t) => { toPlay(g); while (g.state().el < t - 1e-9 && !g.over) { g.step(0.05); if (g.state().el >= PLAY_S + END_S) break; } };
/** First time >= from where the apple is (or is not) under the face. */
function when(ap, from, inside, after = 0) {
  for (let s = after; s < 12; s += 0.005) { const x = Math.abs(appleX(ap, s)); if (inside ? x <= ZONE[ap.kind] * 0.7 : x > ZONE[ap.kind] * 1.5) return +(from + s).toFixed(3); }
  return null;
}

test('meta: a Halloween holiday game, offered only in its season', () => {
  assert.equal(meta.season, 'halloween'); assert.ok(meta.tags.includes('holiday'));
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
  assert.ok(!eligible(2, [], null).includes(meta.id)); assert.ok(eligible(2, [], 'halloween').includes(meta.id)); assert.ok(eligible(1, [], 'halloween').includes(meta.id));
  assert.ok(COUNT_S + PLAY_S + END_S <= meta.seconds);
});

test('the apples: same seed same apples; red first, then gold and spiders; never two spiders in a row; they speed up; every apple reaches the face', () => {
  for (const d of ['easy', 'normal', 'hard']) for (let seed = 1; seed <= 25; seed++) {
    const a = makeApples(makeRng(seed), d);
    assert.deepEqual(a, makeApples(makeRng(seed), d)); assert.equal(a.length, APPLES);
    assert.equal(a[0].kind, 'red'); assert.equal(a[1].kind, 'red');
    for (let k = 1; k < a.length; k++) assert.ok(!(a[k].kind === 'spider' && a[k - 1].kind === 'spider'));
    const kinds = new Set(a.map(x => x.kind)); assert.ok(kinds.has('gold') && kinds.has('spider'), `seed ${seed}: has gold and spiders`);
    for (const ap of a) {
      assert.ok(when(ap, 0, true) != null && when(ap, 0, true) < 3.5, 'every apple swings under the face within a few seconds');
      if (ap.kind === 'spider') assert.equal(ap.life, SPIDER_LIFE);
      for (let s = 0; s < 6; s += 0.1) { const x = appleX(ap, s); assert.ok(x >= -1 && x <= 1); }
    }
    const avg = list => list.reduce((n, x) => n + x.w, 0) / list.length;
    assert.ok(avg(a.slice(40, 60).filter(x => x.kind === 'red')) > avg(a.slice(0, 20).filter(x => x.kind === 'red')), 'later apples are quicker');
  }
});

test('bite(): in the zone = the apple; out of it = a splash and a pause; a spider costs a point; times only move forward', () => {
  const apples = [{ kind: 'red', a: 0.8, w: 2, ph: 0, a2: 0, w2: 1, ph2: 0 }, { kind: 'gold', a: 0.8, w: 3, ph: 0, a2: 0, w2: 1, ph2: 0 }, { kind: 'spider', a: 0.8, w: 2, ph: 0, a2: 0, w2: 1, ph2: 0, life: SPIDER_LIFE }, { kind: 'red', a: 0.8, w: 2, ph: 0, a2: 0, w2: 1, ph2: 0 }];
  const L = newLane();
  assert.equal(bite(L, apples, 0.2), 'splash'); assert.equal(L.stun, 0.2 + SPLASH_S); assert.equal(L.k, 0);
  assert.equal(bite(L, apples, 0.9), null, 'still wiping your eyes');
  const t1 = Math.PI / 2 * 0 + Math.PI / 2;                   // sin(2t) = 0 at t = pi/2: right under the face
  assert.equal(bite(L, apples, t1), 'red'); assert.equal(L.score, 1); assert.equal(L.k, 1); assert.equal(L.from, t1 + NEXT_S);
  assert.equal(bite(L, apples, t1 + 0.3), null, 'the next apple is not up yet');
  const t2 = L.from + Math.PI / 3;                            // sin(3s) = 0 at s = pi/3
  assert.equal(bite(L, apples, t2), 'gold'); assert.equal(L.score, 4);
  // the spider is up next: bite it and lose a point
  const t3 = L.from + Math.PI / 2;
  assert.equal(bite(L, apples, t3), 'spider'); assert.equal(L.score, 3); assert.equal(L.k, 3); assert.equal(L.yuck, 1); assert.equal(L.from, t3 + YUCK_S);
  assert.equal(bite(L, apples, t3 - 1), null, 'never back in time');
  // a spider nobody bites bobs away by itself
  const M = newLane(); M.k = 2; M.from = 10;
  settle(M, apples, 10 + SPIDER_LIFE - 0.01); assert.equal(M.k, 2);
  settle(M, apples, 10 + SPIDER_LIFE); assert.equal(M.k, 3); assert.equal(M.from, 10 + SPIDER_LIFE);
  // the score never goes below zero
  const Z = newLane(); Z.k = 2; assert.equal(bite(Z, apples, Math.PI / 2), 'spider'); assert.equal(Z.score, 0);
});

test('the server judges by the time the phone pressed, within limits, never in the future', () => {
  const g = mk(2, 7), { apples } = g.init();
  g.act(1, 'bite', { k: 0, t: 0 }); assert.equal(g.state().l[1][6], 0, 'nothing before the game starts');
  toPlay(g);
  const hit = when(apples[0], 0, true, 0.3), miss = when(apples[0], 0, false, hit);
  // the future is refused
  g.act(1, 'bite', { k: 0, t: hit }); if (hit > AHEAD_S) assert.equal(g.state().l[1][0], 0, 'a bite from the future is refused');
  until(g, Math.max(hit, miss) + 0.3);
  // a bite made earlier but arriving now (the network) still counts, judged at the time it was made
  g.act(1, 'bite', { k: 0, t: hit });
  assert.equal(g.state().l[1][0], 1); assert.equal(g.state().l[1][3], 1, 'player 1 bit the apple');
  g.act(2, 'bite', { k: 0, t: miss });
  assert.equal(g.state().l[2][0], 0); assert.equal(g.state().l[2][6], 1, 'player 2 splashed');
  // junk and too-old presses are refused
  for (const d of [null, 'x', 5, { k: 1 }, { k: 1, t: 'a' }, { k: 1, t: NaN }, { k: 1.5, t: 1 }, { k: 0, t: -1 }, { k: 1, t: 999 }]) g.act(1, 'bite', d);
  g.act(9, 'bite', { k: 0, t: 1 }); g.act(1, 'eat', { k: 1, t: 1 });
  until(g, g.state().el + LAG_S + 0.5);
  const before = JSON.stringify(g.state().l);
  g.act(2, 'bite', { k: 0, t: hit }); assert.equal(JSON.stringify(g.state().l), before, 'older than the lag allowance');
  g.act(1, 'bite', { k: 0, t: g.state().el }); assert.equal(JSON.stringify(g.state().l), before, 'apple 0 is gone for player 1');
});

test('a perfect biter beats a masher; nobody beats them by idling; ties share a place, splashes break ties; everyone placed once', () => {
  const g = mk(4, 13), { apples } = g.init();
  const lanes = { 1: newLane(), 2: newLane(), 3: newLane() };
  toPlay(g);
  let el = 0;
  while (!g.over) {
    g.step(0.05); el += 0.05; const t = Math.max(0, Math.min(PLAY_S, el) - 0.05);
    for (const p of [1, 2]) {
      const L = lanes[p]; settle(L, apples, t); const ap = apples[L.k];
      if (!ap || ap.kind === 'spider' || t < L.from || t < L.stun || t > PLAY_S) continue;
      if (Math.abs(appleX(ap, t - L.from)) <= ZONE[ap.kind] * 0.7) { const k = L.k; bite(L, apples, t); g.act(p, 'bite', { k, t }); }
    }
    // player 3 bites every half second whatever happens
    const L3 = lanes[3]; settle(L3, apples, t);
    if (Math.round(el * 20) % 10 === 0 && el <= PLAY_S && t >= L3.from && t >= L3.stun && t <= PLAY_S) { const k = L3.k; bite(L3, apples, t); g.act(3, 'bite', { k, t }); }
  }
  const st = g.state().l, r = g.result();
  assert.deepEqual(placed(r), [1, 2, 3, 4]);
  assert.equal(st[1][3], st[2][3], 'two perfect biters with the same apples score the same');
  assert.ok(st[1][3] >= 15, `a perfect biter gets plenty (${st[1][3]})`);
  assert.deepEqual(r.order[0].sort(), [1, 2], 'they share first place');
  assert.ok(st[3][6] > 0, 'player 3 splashed');
  assert.ok(r.scores[3] < r.scores[1], `mashing (${r.scores[3]}) loses to timing (${r.scores[1]})`);
  assert.ok(r.order.findIndex(g2 => g2.includes(4)) >= 1, 'the idler is not first');
  assert.equal(r.scores[4], 0); assert.equal(r.unit, 'apples');
  // splashes break a tie on apples
  const h = mk(2, 3), a2 = h.init().apples; toPlay(h);
  const s0 = when(a2[0], 0, true, 0.2); until(h, s0 + 0.1); h.act(1, 'bite', { k: 0, t: s0 }); h.act(2, 'bite', { k: 0, t: s0 });
  const m = when(a2[1], s0 + NEXT_S, false, 0); until(h, m + 0.1); h.act(2, 'bite', { k: 1, t: m });
  assert.equal(h.state().l[1][3], 1); assert.equal(h.state().l[2][3], 1); assert.equal(h.state().l[2][6], 1);
  while (!h.over) h.step(0.05);
  assert.deepEqual(h.result().order, [[1], [2]], 'same apples: fewer splashes wins');
});

test('ends by itself within meta.seconds for 1-4 players and every difficulty', () => {
  for (let n = 1; n <= 4; n++) for (const d of ['easy', 'normal', 'hard']) {
    const g = mk(n, 30 + n, d); let t = 0;
    while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over); assert.ok(t <= meta.seconds);
    const r = g.result(); assert.deepEqual(placed(r), Array.from({ length: n }, (_, i) => i + 1));
  }
  assert.equal(mk(1).init().solo, true);
});

test('the room plays whole matches of it with bots (Halloween forced on)', () => {
  for (const n of [1, 2, 4]) {
    const W = world({ seed: 30 + n }), ph = [withBots(W.phone())];
    ph[0].send({ t: 'create' }); const code = ph[0].room.code;
    for (let i = 1; i < n; i++) { const p = withBots(W.phone()); p.send({ t: 'join', code }); ph.push(p); }
    ph[0].send({ t: 'opt', key: 'holiday', value: 'halloween' }); ph[0].send({ t: 'opt', key: 'mode', value: 'marathon' }); ph[0].send({ t: 'opt', key: 'pool', value: [meta.id] }); ph[0].send({ t: 'opt', key: 'rounds', value: 1 });
    ph[0].send({ t: 'start' });
    assert.ok(W.run(5 * 60 * 1000, () => ph[0].phase === 'results'), `${n}: reached results`);
    const res = ph[0].last.phase.result;
    assert.equal(ph[0].last.phase.game, meta.id); assert.equal(res.order.flat().length, n);
    assert.ok(Object.values(res.scores).every(v => v >= 8), `bots bit plenty of apples: ${JSON.stringify(res.scores)}`);
  }
});
