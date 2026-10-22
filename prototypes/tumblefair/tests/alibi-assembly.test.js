import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, slotCount, OPTS, NEED, YN } from '../js/games/alibi-assembly/sim.js';
import { SLOTS, CRIMES } from '../js/games/alibi-assembly/data.js';

const mk = (n, seed = 5) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const step = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPhase = (g, ph) => { let n = 0; while (g.state().phase !== ph && !g.over && n++ < 5000) g.step(0.05); };
const shape = (r, pids) => { const all = r.order.flat(); assert.equal(all.length, pids.length); assert.deepEqual([...all].sort(), [...pids].sort()); assert.equal(typeof r.coop.success, 'boolean'); };
/** Answer every question right (or wrong) by reading the private question and the alibi in the study phase. */
function answerAll(g, pids, init, picks, wrongFor = new Set()) {
  for (const p of pids) for (let guard = 0; guard < 20; guard++) {
    const d = g.priv(p); if (!d.q) break;
    const si = init.slots.findIndex(s => s.ask === d.q.text);
    let right;
    if (si >= 0) right = d.q.opts.indexOf(init.slots[si].opts[picks[si]]);
    else {                                             // yes/no: is every named detail in the alibi?
      const ok = init.slots.every((s, i) => { const hit = s.opts.find(o => d.q.text.includes(o)); return !hit || hit === s.opts[picks[i]]; });
      right = ok ? 0 : 1;
    }
    g.act(p, 'ans', { i: d.qi, o: wrongFor.has(p) ? (right + 1) % d.q.opts.length : right });
  }
}

test('data: enough crimes, every slot has ten distinct options and a clause', () => {
  assert.ok(CRIMES.length >= 12);
  for (const s of SLOTS) { assert.equal(new Set(s.opts).size, 10); assert.ok(s.yn.includes('{x}')); assert.ok(s.ask.endsWith('?')); }
});

test('slots belong to players round robin; only the owner may pick; picks are public while building', () => {
  for (const n of [2, 3, 4]) {
    const g = mk(n), init = g.init();
    assert.equal(init.slots.length, slotCount(n));
    init.slots.forEach((s, i) => { assert.equal(s.owner, i % n + 1); assert.equal(s.opts.length, OPTS); });
    g.act(init.slots[0].owner === 1 ? 2 : 1, 'pick', { s: 0, o: 1 });
    assert.equal(g.state().picks[0], null, 'not the owner');
    g.act(1, 'pick', { s: 0, o: 2 }); g.act(1, 'pick', { s: 0, o: 9 }); g.act(1, 'pick', 'junk');
    assert.equal(g.state().picks[0], 2);
  }
});

test('unpicked slots are filled by the house and marked; everyone right = story holds, scores = right answers', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 11 + n), init = g.init(), pids = init.slots.length && Array.from({ length: n }, (_, i) => i + 1);
    if (n > 1) g.act(1, 'pick', { s: 0, o: 3 });
    toPhase(g, 'study');
    const st = g.state(); assert.ok(st.picks.every(x => x != null));
    if (n > 1) { assert.equal(st.picks[0], 3); assert.ok(!st.auto.includes(0)); assert.ok(st.auto.includes(1)); }
    toPhase(g, 'ask');
    assert.equal(g.state().picks, undefined, 'the alibi is hidden while questioned');
    answerAll(g, pids, init, st.picks);
    step(g, 1.2); assert.equal(g.state().phase, 'verdict', 'everyone answered: early verdict');
    const r = g.result(); shape(r, pids);
    assert.equal(r.coop.success, true); assert.equal(r.order.length, 1);
    for (const p of pids) assert.equal(r.scores[p], init.q);
    assert.equal(init.q, slotCount(n) + YN);
  }
});

test('a player who gets everything wrong is ranked last and can sink the team', () => {
  const g = mk(2, 3), init = g.init(); toPhase(g, 'study'); const picks = g.state().picks; toPhase(g, 'ask');
  answerAll(g, [1, 2], init, picks, new Set([2]));
  step(g, 1.2);
  const r = g.result(); shape(r, [1, 2]);
  assert.deepEqual(r.order, [[1], [2]]); assert.equal(r.scores[2], 0); assert.equal(r.coop.success, false);
  const rv = g.state().reveal; assert.ok(rv.wrong.every(w => w.includes(2) && !w.includes(1)));
});

test('answers: one per question, in order; out-of-turn and bad answers ignored', () => {
  const g = mk(3); toPhase(g, 'ask');
  g.act(1, 'ans', { i: 1, o: 0 }); assert.equal(g.priv(1).qi, 0);
  g.act(1, 'ans', { i: 0, o: 7 }); assert.equal(g.priv(1).qi, 0);
  g.act(1, 'ans', { i: 0, o: 0 }); assert.equal(g.priv(1).qi, 1);
  assert.deepEqual(g.state().progress, { 1: 1, 2: 0, 3: 0 });
});

test('nobody does anything: ends by itself in time, story busted, everyone tied on 0', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 40 + n); let t = 0;
    while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over, `ends within meta.seconds for ${n}`);
    const r = g.result(); shape(r, Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(r.coop.success, false); assert.equal(r.order.length, 1);
  }
});

test('the same seed asks the same questions; result() works mid-game', () => {
  const a = mk(2, 9), b = mk(2, 9); toPhase(a, 'ask'); toPhase(b, 'ask');
  assert.deepEqual(a.priv(1), b.priv(1));
  const c = mk(3, 2); step(c, 3); const r = c.result(); shape(r, [1, 2, 3]);
  assert.ok(NEED > 0.5);
});
