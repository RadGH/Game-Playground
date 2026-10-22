import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, settleLot, ENERGY, ROUNDS, TAPS_PER, MASH_CAP, CURSE, SHOW_S, BID_S, REVEAL_S, END_S, LOTS } from '../js/games/going-going-gone/sim.js';
import { world, withBots } from './helpers.js';

const mk = (n, seed = 4) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toBid = g => { const r = g.state().round; while (!(g.state().phase === 'bid' && g.state().round > r)) g.step(0.05); };
const toReveal = g => { while (g.state().phase !== 'reveal') g.step(0.05); return g.state().reveal; };
const placed = r => r.order.flat().sort((a, b) => a - b);
const lotNow = g => g.state().lots[g.state().round];

test('the rules for one lot', () => {
  const normal = { kind: 'normal', v: 6 }, mystery = { kind: 'mystery', v: 9 }, cursed = { kind: 'cursed', v: CURSE };
  let r = settleLot(normal, { 1: 5, 2: 3, 3: 0 });
  assert.deepEqual(r.win, ['1']); assert.deepEqual(r.gain, { 1: 6, 2: 0, 3: 0 }); assert.deepEqual(r.pay, { 1: 5, 2: 0, 3: 0 }, 'only the winner pays');
  r = settleLot(normal, { 1: 4, 2: 4, 3: 1 });
  assert.deepEqual(r.win, ['1', '2']); assert.deepEqual(r.gain, { 1: 3, 2: 3, 3: 0 }, 'a tie splits the points'); assert.deepEqual(r.pay, { 1: 4, 2: 4, 3: 0 });
  r = settleLot({ kind: 'normal', v: 5 }, { 1: 2, 2: 2 }); assert.deepEqual(r.gain, { 1: 2, 2: 2 }, 'rounded down');
  r = settleLot(normal, { 1: 0, 2: 0 }); assert.deepEqual(r.win, [], 'nobody bid: unsold'); assert.deepEqual(r.pay, { 1: 0, 2: 0 });
  r = settleLot(mystery, { 1: 1, 2: 0 }); assert.deepEqual(r.gain, { 1: 9, 2: 0 });
  r = settleLot(cursed, { 1: 3, 2: 1, 3: 2 });
  assert.deepEqual(r.win, ['2']); assert.deepEqual(r.gain, { 1: 0, 2: CURSE, 3: 0 }); assert.deepEqual(r.pay, { 1: 3, 2: 1, 3: 2 }, 'everyone pays on the cursed lot');
  r = settleLot(cursed, { 1: 0, 2: 0, 3: 2 }); assert.deepEqual(r.win, ['1', '2'], 'every tied lowest takes the curse');
});

test('five lots, all shown up front: three normal, one mystery (worth hidden), one cursed in the middle', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = mk(2, seed), lots = g.state().lots;
    assert.equal(lots.length, ROUNDS);
    assert.equal(lots.filter(l => l.kind === 'normal').length, 3);
    assert.equal(lots.filter(l => l.kind === 'mystery').length, 1);
    const ci = lots.findIndex(l => l.kind === 'cursed'); assert.ok(ci >= 1 && ci <= 3, `seed ${seed}: cursed at ${ci}`);
    assert.equal(lots[ci].v, CURSE);
    assert.equal(lots.find(l => l.kind === 'mystery').v, null, 'the mystery worth is not public');
    assert.equal(new Set(lots.filter(l => l.kind === 'normal').map(l => l.v)).size, 3);
    assert.ok(lots.every(l => l.name && !/muster|ember|veil/i.test(l.name)));
  }
  assert.ok(LOTS.normal.length >= 10 && LOTS.cursed.length >= 4);
  assert.ok(meta.how.length >= 2 && meta.how.length <= 4); assert.match(meta.blurb, /!$/);
});

test('bids are private, checked against your energy, and revealed together', () => {
  const g = mk(3); toBid(g);
  const before = JSON.stringify(g.state());
  g.act(1, 'bid', 7); assert.equal(g.priv(1).bid, 7);
  assert.equal(JSON.stringify(g.state()), before, 'a bid changes nothing in public');
  for (const d of [ENERGY + 1, -1, 2.5, '3', null]) g.act(1, 'bid', d);
  g.act(9, 'bid', 3); g.act(1, 'outbid', 3);
  assert.equal(g.priv(1).bid, 7);
  g.act(2, 'bid', 2);
  const r = toReveal(g); assert.equal(r.bids[1], 7); assert.equal(r.bids[2], 2); assert.equal(r.bids[3], 0);
  g.act(1, 'bid', 1); assert.equal(g.state().reveal.bids[1], 7, 'too late once revealed');
});

test('energy is spent for good and carries across rounds; points add up', () => {
  const g = mk(2, 8); toBid(g);
  const lot = lotNow(g);
  g.act(1, 'bid', 6); g.act(2, 'bid', 2);
  toReveal(g);
  const s = g.state();
  if (lot.kind === 'cursed') { assert.equal(s.energy[1], ENERGY - 6); assert.equal(s.energy[2], ENERGY - 2); assert.equal(s.pts[2], CURSE); }
  else { assert.equal(s.energy[1], ENERGY - 6); assert.equal(s.energy[2], ENERGY); assert.ok(s.pts[1] >= 0); }
  toBid(g); g.act(1, 'bid', ENERGY); assert.notEqual(g.priv(1).bid, ENERGY, 'cannot bid energy already spent');
});

test('rummaging: every 4 taps finds 1 energy, 3 a round at most, one tap counted a step, public rattle, not once locked', () => {
  const g = mk(2); toBid(g);
  for (let i = 0; i < 4; i++) g.act(1, 'mash');
  assert.equal(g.priv(1).taps, 1, 'four taps inside one step count once');
  for (let i = 0; i < 40; i++) { g.act(1, 'mash'); g.step(0.05); }
  assert.equal(g.priv(1).found, MASH_CAP); assert.equal(g.state().energy[1], ENERGY + MASH_CAP);
  assert.equal(g.state().rattle[1], MASH_CAP * TAPS_PER, 'everyone can see the rattle');
  g.act(2, 'lock', true); g.act(2, 'mash'); g.step(0.05); assert.equal(g.priv(2).taps, 0, 'locked: no rummaging');
  g.act(1, 'bid', ENERGY + MASH_CAP); assert.equal(g.priv(1).bid, ENERGY + MASH_CAP, 'found energy can be bid at once');
  toBid(g); assert.equal(g.priv(1).found, 0, 'the cap is per round'); assert.equal(g.state().rattle[1], 0);
});

test('everyone locked skips the wait; changing the bid unlocks you', () => {
  const g = mk(2); toBid(g);
  g.act(1, 'lock', true); assert.equal(g.priv(1).locked, true);
  g.act(1, 'bid', 3); assert.equal(g.priv(1).locked, false);
  for (const d of ['yes', 1, null]) g.act(1, 'lock', d); assert.equal(g.priv(1).locked, false);
  g.act(1, 'lock', true); g.act(2, 'lock', true); run(g, 0.7);
  assert.equal(g.state().phase, 'reveal');
});

test('the cursed lot: the lowest offer takes it, so spending a little dodges it', () => {
  let seen = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = mk(3, seed);
    for (let r = 0; r < ROUNDS; r++) {
      toBid(g);
      if (lotNow(g).kind !== 'cursed') continue;
      g.act(1, 'bid', 1); g.act(2, 'bid', 2); g.act(3, 'bid', 0);
      const rv = toReveal(g); assert.deepEqual(rv.win, ['3']);
      assert.equal(g.state().pts[3], CURSE); seen++; break;
    }
  }
  assert.equal(seen, 20);
});

test('final order: points, then energy left; ties share a place; every pid once', () => {
  const g = mk(4, 3);
  for (let r = 0; r < ROUNDS; r++) {
    toBid(g);
    const k = lotNow(g).kind;
    if (k === 'cursed') { g.act(1, 'bid', 1); g.act(2, 'bid', 1); g.act(3, 'bid', 1); }      // 4 takes the curse
    else if (k === 'normal' && r < 4) { g.act(1, 'bid', 3); }                                // 1 buys the normal lots cheaply
  }
  run(g, 30); assert.ok(g.over);
  const res = g.result(), s = g.state();
  assert.deepEqual(placed(res), [1, 2, 3, 4]); assert.equal(res.unit, 'points');
  assert.equal(res.order[0][0], 1);
  assert.deepEqual(res.order.at(-1), [4], 'cursed and nothing else');
  assert.deepEqual(res.order.find(o => o.includes(2)), [2, 3], 'same points, same energy: tied');
  assert.equal(s.pts[4], CURSE);
  // the same points, more energy left: placed higher
  const h = mk(2, 3);
  for (let r = 0; r < ROUNDS; r++) { toBid(h); if (lotNow(h).kind === 'cursed') { h.act(1, 'bid', 2); h.act(2, 'bid', 2); } }
  run(h, 30);
  assert.deepEqual(h.result().order, [[1, 2]], 'equal on both: one group');
});

test('solo: against Auntie Gavel, whose bids come from the seed; the result places only the player', () => {
  const a = mk(1, 12), b = mk(1, 12);
  assert.equal(a.init().cpu, 'Auntie Gavel');
  const bids = [];
  for (let r = 0; r < ROUNDS; r++) { toBid(a); toBid(b); a.act(1, 'bid', 2); b.act(1, 'bid', 2); const ra = toReveal(a), rb = toReveal(b); assert.deepEqual(ra, rb); bids.push(ra.bids.cpu); }
  assert.ok(bids.some(x => x > 0), 'the CPU bids'); assert.ok('cpu' in a.state().energy);
  run(a, 30); assert.ok(a.over);
  assert.deepEqual(a.result().order, [[1]]); assert.deepEqual(Object.keys(a.result().scores), ['1']);
});

test('nobody does anything: ends inside meta.seconds for 1-4 players', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 20 + n); let t = 0;
    for (; t < meta.seconds + 3 && !g.over; t += 0.05) g.step(0.05);
    assert.ok(g.over && t <= meta.seconds, `${n}: ${t.toFixed(1)} s`);
    assert.deepEqual(placed(g.result()), Array.from({ length: n }, (_, i) => i + 1));
  }
  assert.ok(SHOW_S + ROUNDS * (BID_S + REVEAL_S) + END_S + 2 <= meta.seconds);
});

test('through the room with bot phones: 1-4 players reach the results early', () => {
  for (const n of [1, 2, 3, 4]) {
    const w = world({ seed: 80 + n });
    const host = withBots(w.phone()); host.send({ t: 'create' });
    for (let i = 1; i < n; i++) withBots(w.phone()).send({ t: 'join', code: host.room.code });
    host.send({ t: 'opt', key: 'mode', value: 'marathon' }); host.send({ t: 'opt', key: 'pool', value: [meta.id] }); host.send({ t: 'opt', key: 'rounds', value: 1 });
    host.send({ t: 'start' });
    assert.ok(w.run(5 * 60 * 1000, () => host.phase === 'game'));
    const t0 = w.now;
    assert.ok(w.run(5 * 60 * 1000, () => host.phase === 'results'), `${n}: results`);
    assert.ok(w.now - t0 < meta.seconds * 1000, `${n}: ${(w.now - t0) / 1000} s`);
  }
});
