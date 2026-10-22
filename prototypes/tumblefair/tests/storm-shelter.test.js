import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, RULES, EVENTS, CARDS, METERS, applyCard, windFor, perBeat } from '../js/games/storm-shelter/sim.js';

const DT = 0.05;
const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
const pidsOf = n => Array.from({ length: n }, (_, i) => 10 + i);
const add = (m, fx) => { const out = m.slice(); for (const [k, v] of Object.entries(fx)) out[METERS.indexOf(k)] += v; return out; };
/** The talking team: picks the choice that leaves the lowest meter highest, then each player in turn plays the card
 *  that raises the lowest meter most (counting the cap of 10). */
function smart(g, n) {
  let seen = -1;
  return () => {
    const st = g.state(); if (st.ph !== 'beat' || st.beat === seen) return; seen = st.beat;
    const ev = EVENTS[st.ev]; let base = add(st.m, ev.hit); base = base.map((v, i) => v + st.wind[i]);
    let ch = 0, bestMin = -99;
    ev.ch.forEach((c, i) => { const m = add(base, c.fx); const s = Math.min(...m) * 10 + m.reduce((a, b) => a + b, 0); if (s > bestMin) { bestMin = s; ch = i; } });
    let m = add(base, ev.ch[ch].fx);
    for (const p of pidsOf(n)) {
      g.act(p, 'vote', ch);
      const hand = g.priv(p).hand, used = new Set();
      for (let k = 0; k < perBeat(n); k++) {
        let pick = -1, score = -1e9;
        hand.forEach((id, i) => { if (used.has(i)) return; const mm = m.slice(); applyCard(mm, CARDS[id].fx); const s = Math.min(...mm) * 10 + mm.reduce((a, b) => a + Math.min(b, 10), 0); if (s > score) { score = s; pick = i; } });
        used.add(pick); applyCard(m, CARDS[hand[pick]].fx); g.act(p, 'play', pick);
      }
    }
  };
}
/** A team that does not talk: random choices, random cards. */
function random(g, n, rng) {
  let seen = -1;
  return () => {
    const st = g.state(); if (st.ph !== 'beat' || st.beat === seen) return; seen = st.beat;
    for (const p of pidsOf(n)) { g.act(p, 'vote', rng.int(0, EVENTS[st.ev].ch.length - 1)); const h = g.priv(p).hand; const picks = rng.shuffle(h.map((_, i) => i)).slice(0, perBeat(n)); for (const i of picks) g.act(p, 'play', i); }
  };
}
function run(g, bot) { let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { bot?.(); g.step(DT); g.events.splice(0); steps++; } return steps; }
function checkResult(g, n) {
  const r = g.result();
  assert.ok(r.coop && typeof r.coop.success === 'boolean'); assert.equal(r.order.length, 1);
  assert.deepEqual([...r.order[0]].sort(), pidsOf(n)); assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}

test('the deck: 40+ events with 2-3 choices; every hit and choice uses real meters; no free choices', () => {
  assert.ok(EVENTS.length >= 40, `${EVENTS.length} events`);
  for (const e of EVENTS) {
    assert.ok(e.t && e.d && e.a); assert.ok(e.ch.length >= 2 && e.ch.length <= 3, e.t);
    const hit = Object.values(e.hit).reduce((a, b) => a + b, 0); assert.ok(hit <= -2 && hit >= -3, `${e.t} hit ${hit}`);
    for (const c of e.ch) { for (const k of Object.keys(c.fx)) assert.ok(METERS.includes(k)); const s = Object.values(c.fx).reduce((a, b) => a + b, 0); assert.ok(s <= 1 && s >= -1, `${e.t}: ${c.l}`); }
  }
  for (const c of Object.values(CARDS)) for (const k of Object.keys(c.fx)) assert.ok(METERS.includes(k) || k === 'low');
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody plays — the shelter falls early, a loss`, () => {
  const g = make(n, 40 + n), steps = run(g);
  assert.ok(g.over); assert.ok(steps < meta.seconds / DT);
  const r = checkResult(g, n); assert.equal(r.coop.success, false);
  assert.ok(g.state().m.some(v => v === 0));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that talks it over survives; one that plays at random usually does not`, () => {
  let ok = 0, lucky = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = make(n, seed * 31 + n), steps = run(g, smart(g, n));
    assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
    const r = checkResult(g, n); if (r.coop.success) ok++;
    if (r.coop.success) assert.ok(Object.values(r.scores).every(s => s > 0), 'everyone contributed');
    const h = make(n, seed * 31 + n); run(h, random(h, n, makeRng(seed))); if (h.result().coop.success) lucky++;
  }
  assert.ok(ok >= 5, `talking team survived ${ok}/6`);
  assert.ok(lucky <= 3, `random team survived ${lucky}/6`);
});

test('a meter tops out at 10, and the extra is not credited', () => {
  const m = [9, 5, 5]; assert.equal(applyCard(m, { heat: 3 }), 1); assert.deepEqual(m, [10, 5, 5]);
  const m2 = [4, 2, 7]; assert.equal(applyCard(m2, { low: 2 }), 2); assert.deepEqual(m2, [4, 4, 7]);
  const m3 = [5, 10, 5]; assert.equal(applyCard(m3, { roof: 3, food: -1 }), 0); assert.deepEqual(m3, [5, 10, 4]);
});

test('votes: majority wins, a tie goes to the first-voted choice, nobody voting = the first choice; the beat ends early when all are in', () => {
  const g = make(3, 4), [a, b, c] = pidsOf(3);
  while (g.state().ph !== 'beat') g.step(DT);
  const ev = EVENTS[g.state().ev];
  g.act(a, 'vote', 1); g.act(b, 'vote', 0); g.act(c, 'vote', 1);
  assert.deepEqual(g.state().votes.slice(0, 2), [1, 2]);
  g.act(c, 'vote', 0); assert.deepEqual(g.state().votes.slice(0, 2), [2, 1], 'changing your vote');
  g.act(a, 'vote', 99); g.act(a, 'play', 99); g.act(a, 'nope', 1);     // ignored
  for (const p of [a, b, c]) g.act(p, 'play', 0);
  assert.ok(g.state().bl <= 1, 'everyone in: ends early');
  let ev2 = []; for (let i = 0; i < 20 && !ev2.length; i++) { g.step(DT); ev2 = g.events.splice(0).filter(e => e.e === 'resolve'); }
  assert.equal(ev2[0].ch, 0); assert.equal(ev2[0].played.length, 3); assert.ok(ev.ch.length >= 2);
  // tie
  const h = make(2, 4), [x, y] = pidsOf(2);
  while (h.state().ph !== 'beat') h.step(DT);
  h.act(y, 'vote', 1); h.act(x, 'vote', 0);
  let r = []; while (!r.length) { h.step(DT); r = h.events.splice(0).filter(e => e.e === 'resolve'); }
  assert.equal(r[0].ch, 1);
  // nobody votes
  let r2 = []; while (!r2.length) { h.step(DT); r2 = h.events.splice(0).filter(e => e.e === 'resolve'); }
  assert.equal(r2[0].ch, 0); assert.equal(r2[0].played.length, 0);
});

test('hands are private and refill; solo holds 4 and plays 2; playing a third swaps out the oldest pick', () => {
  const g = make(1, 8), p = 10;
  while (g.state().ph !== 'beat') g.step(DT);
  assert.equal(g.priv(p).hand.length, RULES.soloHand); assert.equal(g.init().per, 2);
  g.act(p, 'play', 0); g.act(p, 'play', 1); g.act(p, 'play', 2); assert.deepEqual(g.priv(p).play, [1, 2]);
  g.act(p, 'play', 2); assert.deepEqual(g.priv(p).play, [1], 'tap again to take it back');
  const st = JSON.stringify(g.state()); assert.ok(!st.includes('hand'));
  const t = make(2, 8); while (t.state().ph !== 'beat') t.step(DT);
  assert.equal(t.priv(10).hand.length, RULES.hand); t.act(10, 'play', 0); t.act(10, 'play', 1); assert.deepEqual(t.priv(10).play, [1]);
  let r = []; while (!r.length) { t.step(DT); r = t.events.splice(0).filter(e => e.e === 'resolve'); }
  assert.equal(t.priv(10).hand.length, RULES.hand, 'refilled');
});

test('the wind grows with the team and the storm', () => {
  assert.ok(windFor(1, 0) >= 2); assert.ok(windFor(4, 0) > windFor(2, 0)); assert.ok(windFor(3, 10) > windFor(3, 0));
});

test('same seed, same plays, same storm', () => {
  const a = make(3, 9), b = make(3, 9), ba = smart(a, 3), bb = smart(b, 3);
  for (let i = 0; i < 800; i++) { ba(); bb(); a.step(DT); b.step(DT); }
  assert.deepEqual(a.state(), b.state());
});
