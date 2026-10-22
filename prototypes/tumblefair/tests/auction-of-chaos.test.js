import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, ITEMS, appraise, settleLot, pickLots, cpuBid, publicItem, CHIPS, LOTS, START_S, BID_S, SOLD_S, FINALE_S, END_S, CPU } from '../js/games/auction-of-chaos/sim.js';

const mk = (n, seed = 8) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPhase = (g, ph) => { while (g.state().phase !== ph && !g.over) g.step(0.05); };
const KINDS = ['flat', 'eat', 'drop', 'spoil', 'clash', 'perTag', 'alone', 'crowd', 'copy', 'chips', 'broke', 'lastLot', 'rivals', 'gift'];

test('the catalogue: 50+ items, unique ids, every twist a known kind with a clue and a reveal line', () => {
  assert.ok(ITEMS.length >= 50, `${ITEMS.length} items`);
  assert.equal(new Set(ITEMS.map(i => i.id)).size, ITEMS.length);
  for (const i of ITEMS) {
    assert.ok(KINDS.includes(i.fx.k), `${i.id}: ${i.fx.k}`);
    assert.ok(i.name && i.icon && i.clue && i.twist && Number.isInteger(i.v) && Array.isArray(i.tags), i.id);
    if (['spoil', 'clash', 'perTag'].includes(i.fx.k)) assert.ok(typeof i.fx.tag === 'string', i.id);
  }
  for (const k of KINDS) assert.ok(ITEMS.some(i => i.fx.k === k), `no item uses ${k}`);
});

test('the twists are hidden until the finale', () => {
  const g = mk(2);
  const init = JSON.stringify(g.init()); assert.ok(!init.includes('"fx"') && !init.includes('twist'));
  assert.deepEqual(Object.keys(g.init().lots[0]).sort(), Object.keys(publicItem(ITEMS[0])).sort());
  toPhase(g, 'bid'); assert.equal(g.state().twists, undefined);
  toPhase(g, 'finale'); assert.equal(Object.keys(g.state().twists).length, LOTS);
});

test('appraise: the golden goose eats your best other item; a snow globe melts next to something hot', () => {
  let a = appraise({ 1: ['golden-goose', 'crown-jewel', 'old-boot'], 2: [] }, { 1: 0, 2: 0 }, 'old-boot');
  const r = Object.fromEntries(a.rows[1].map(x => [x.id, x]));
  assert.equal(r['crown-jewel'].dead, true); assert.equal(r['crown-jewel'].value, 0);
  assert.equal(r['old-boot'].value, 8); assert.equal(a.total[1], 9 + 8);
  a = appraise({ 1: ['snow-globe', 'campfire-kit'] }, { 1: 0 }, 'x');
  assert.equal(a.rows[1][0].dead, true, 'the campfire ruins cold things first'); assert.equal(a.total[1], 5);
  a = appraise({ 1: ['snow-globe', 'dragon-egg'] }, { 1: 0 }, 'x');
  assert.equal(a.rows[1][0].value, 0, 'a clash: worth 0 next to something hot'); assert.equal(a.total[1], 10);
});

test('appraise: rivals, gifts, chips, crowds, copies, last lot, never below 0', () => {
  let a = appraise({ 1: ['haunted-teddy'], 2: ['old-boot'], 3: [] }, { 1: 0, 2: 0, 3: 0 }, 'x');
  assert.deepEqual(a.total, { 1: 6, 2: 6, 3: 0 });
  a = appraise({ 1: ['boomerang-vase', 'old-boot'], 2: ['mystery-gift'], 3: ['rattly-box'] }, { 1: 0, 2: 0, 3: 0 }, 'x');
  assert.equal(a.total[1], 8); assert.equal(a.total[2], 5 + 8, 'the poorest rival gets it'); assert.deepEqual(a.moved, [['1', '2', 8, 'boomerang-vase']]);
  a = appraise({ 1: ['lucky-penny'] }, { 1: 7 }, 'x'); assert.equal(a.total[1], 9);
  a = appraise({ 1: ['party-poppers', 'old-boot', 'rattly-box'] }, { 1: 0 }, 'x'); assert.equal(a.rows[1][0].value, 9);
  a = appraise({ 1: ['copycat-crystal', 'cursed-crown'] }, { 1: 0 }, 'x'); assert.equal(a.rows[1][0].value, 10);
  a = appraise({ 1: ['wishing-star'] }, { 1: 0 }, 'wishing-star'); assert.equal(a.total[1], 9);
  a = appraise({ 1: ['cursed-crown'] }, { 1: 0 }, 'x'); assert.equal(a.total[1], 0, 'floored at 0');
  a = appraise({ 1: ['campfire-kit', 'old-boot'] }, { 1: 0 }, 'x'); assert.equal(a.rows[1][0].hit, false, 'nothing cold: the twist did nothing'); assert.equal(a.rows[1][1].hit, true);
});

test('a lot: highest bid wins and pays; ties go to fewer prizes, then more chips, else unsold', () => {
  assert.equal(settleLot({ 1: 3, 2: 5 }, {}, { 1: 15, 2: 15 }), '2');
  assert.equal(settleLot({ 1: 0, 2: 0 }, {}, { 1: 15, 2: 15 }), null);
  assert.equal(settleLot({ 1: 4, 2: 4 }, { 1: 1, 2: 0 }, { 1: 15, 2: 15 }), '2');
  assert.equal(settleLot({ 1: 4, 2: 4 }, {}, { 1: 9, 2: 15 }), '2');
  assert.equal(settleLot({ 1: 4, 2: 4 }, {}, { 1: 15, 2: 15 }), null);
  const g = mk(2); toPhase(g, 'bid');
  g.act(1, 'bid', 6); g.act(2, 'bid', 2); toPhase(g, 'sold');
  assert.deepEqual(g.state().sold, { win: 1, bids: { 1: 6, 2: 2 }, pay: 6 });
  assert.equal(g.state().chips[1], CHIPS - 6); assert.equal(g.state().hauls[1], 1);
});

test('bids are private and capped by your chips; everyone locked ends the bidding early', () => {
  const g = mk(2); g.act(1, 'bid', 3); toPhase(g, 'bid'); assert.equal(g.priv(1).bid, 0, 'not before the first lot');
  for (const d of [-1, 16, 2.5, '3', null]) g.act(1, 'bid', d);
  assert.equal(g.priv(1).bid, 0);
  g.act(1, 'bid', 4); assert.equal(g.priv(1).bid, 4); assert.equal(g.state().sold, undefined, 'no bids in the public state');
  g.act(1, 'lock', true); g.act(2, 'lock', true); run(g, 0.6); assert.equal(g.state().phase, 'sold');
});

test('solo: Baron Bidwell bids from the seed, never more than he has, and is not placed', () => {
  for (let s = 0; s < 200; s++) { const r = makeRng(s), c = r.int(0, 15); const b = cpuBid(r, ITEMS[s % ITEMS.length], c, s % 6); assert.ok(b >= 0 && b <= c); }
  const g = mk(1, 12); run(g, 70); assert.ok(g.over);
  assert.deepEqual(g.result().order, [[1]]); assert.equal(g.result().scores[CPU], undefined);
  assert.ok(g.state().won.includes(CPU), 'the Baron won something');
});

test('six different lots, never more than three plain losers; ends inside the clock', () => {
  for (let s = 1; s < 50; s++) { const l = pickLots(makeRng(s)); assert.equal(new Set(l.map(i => i.id)).size, LOTS); assert.ok(l.filter(i => i.fx.k === 'flat' && i.fx.n < 0).length <= 3); }
  assert.ok(START_S + LOTS * (BID_S + SOLD_S) + FINALE_S + END_S <= meta.seconds);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): every pid placed once, ties share, scores match the appraisal`, () => {
  const g = mk(n, 50 + n);
  while (!g.over) { const s = g.state(); if (s.phase === 'bid' && !s.in.length) for (let p = 1; p <= n; p++) { g.act(p, 'bid', Math.min(s.chips[p], (p + s.lot) % 5)); g.act(p, 'lock', true); } g.step(0.05); }
  const r = g.result(), fin = g.state().final;
  assert.deepEqual(r.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
  for (const grp of r.order) for (const p of grp) { assert.equal(r.scores[p], r.scores[grp[0]]); assert.equal(r.scores[p], fin.total[p]); }
  const s = r.order.map(grp => r.scores[grp[0]]); for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1]);
});

test('nobody bids: nothing sells, a four-way draw at 0', () => { const g = mk(4); run(g, 70); assert.deepEqual(g.result().order, [[1, 2, 3, 4]]); assert.ok(g.state().won.every(w => w === null)); });
