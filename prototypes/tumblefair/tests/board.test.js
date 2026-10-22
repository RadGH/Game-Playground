// The board's round-5 rules: new spaces (duck pond, dice duel, bumper cart), the Fair Bulletin, every Wheel of
// Whatever result, and the bonus ribbons at the end. Driven straight through createBoardMatch on a pretend clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardMatch, BOARD, LAST_CALL } from '../js/sim/board.js';
import { makeRng } from '../js/shared/rng.js';

const def = JSON.parse(readFileSync(new URL('../data/boards/fairground.json', import.meta.url)));
const chance = JSON.parse(readFileSync(new URL('../data/chance.json', import.meta.url)));

function match(n = 3, seed = 4, ch = chance) {
  const evs = [];
  const B = createBoardMatch({ def, chance: ch, order: Array.from({ length: n }, (_, i) => i + 1), rng: makeRng(seed), names: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }, emit: e => evs.push(e) });
  return { B, evs };
}
/** Play rounds with nobody tapping (the timers roll and answer): must always finish and keep the numbers sane. */
function playRounds(B, rounds, t0 = 0) {
  let t = t0;
  for (let r = 1; r <= rounds; r++) { B.beginRound(t, r, rounds); for (let i = 0; i < 4000 && !B.roundDone; i++) { t += 50; B.tick(t); } assert.ok(B.roundDone, `round ${r} finished`); }
  return t;
}

test('every chance event and bulletin has a known effect and fills its text', () => {
  const known = new Set(['tickets', 'all', 'steal', 'give', 'robin', 'swap', 'move', 'ribbon', 'boost', 'pinata', 'tax', 'lowest', 'tobooth', 'allmove', 'flip', 'shuffle', 'ribbonother', 'tostart', 'treat', 'swaptickets']);
  for (const e of chance.events) assert.ok(known.has(e.do), e.id);
  assert.ok(chance.events.length >= 25 && chance.bulletins.length >= 8);
  for (const e of chance.events) for (let n = 1; n <= 4; n++) {         // each effect alone, 1-4 players
    const { B, evs } = match(n, 7, { events: [e] });
    B.S.tickets[1] = 12; B.S.tickets[2] = 3;
    B.beginRound(0); B.roll(1, 0, 2); let t = 0; while (B.S.sub !== 'fx' && t < 20000) { t += 50; B.tick(t); }
    const fx = evs.filter(x => x.ev === 'fx').pop();
    if (B.byId.get(B.S.pos[1]).type !== 'chance') continue;              // (landed elsewhere: the effect never ran)
    assert.ok(fx.text && !fx.text.includes('{'), `${e.id}: ${fx.text}`);
    for (const p of B.S.order) { assert.ok(B.S.tickets[p] >= 0); assert.ok(B.byId.has(B.S.pos[p]), `${e.id} pos`); }
  }
});

test('whole matches with the timers answering: 1-4 players, many seeds, nothing breaks', () => {
  for (let n = 1; n <= 4; n++) for (let seed = 1; seed <= 25; seed++) {
    const { B, evs } = match(n, seed);
    playRounds(B, 5);
    for (const p of B.S.order) { assert.ok(Number.isInteger(B.S.tickets[p]) && B.S.tickets[p] >= 0); assert.ok(B.byId.has(B.S.pos[p])); }
    for (const e of evs) if (e.text) assert.ok(!e.text.includes('{') && !e.text.includes('undefined') && !e.text.includes('NaN'), e.text);
    const aw = B.bonus({ 1: 2 });
    assert.ok(aw.length <= 2);
    if (n === 1) assert.equal(aw.length, 0);
    for (const a of aw) assert.ok(a.pids.length >= 1 && a.pids.length < n && a.value > 0);
  }
});

test('the bulletin: none in round 1, one from round 2, Last Call in the last round (doubles a ticket stand)', () => {
  const { B, evs } = match(2, 3);
  B.beginRound(0, 1, 3); assert.equal(evs.filter(e => e.ev === 'bulletin').length, 0);
  let t = playRounds(B, 0); B.S.roundDone = true;
  B.beginRound(100000, 2, 3); assert.equal(evs.filter(e => e.ev === 'bulletin').length, 1); assert.equal(B.S.sub, 'bulletin');
  B.beginRound(200000, 3, 3); const last = evs.filter(e => e.ev === 'bulletin').pop(); assert.equal(last.id, LAST_CALL.id);
  B.S.sub = 'roll'; B.S.pid = 1; const pos = B.S.pos[1] = 's0', before = B.S.tickets[1];
  B.roll(1, 200000, 1); let tt = 200000; while (B.S.sub !== 'fx' && tt < 230000) { tt += 50; B.tick(tt); }
  assert.equal(B.S.tickets[1] - before, BOARD.TICKET * 2, 's1 is a ticket stand: Last Call pays double');
});

test('duck pond: three prizes, the pick pays; the timer picks the first duck', () => {
  const { B, evs } = match(2, 5);
  const duckAt = def.spaces.find(s => s.type === 'duck').id, prev = def.spaces.find(s => s.next[0] === duckAt).id;
  B.beginRound(0); B.S.pos[1] = prev; const before = B.S.tickets[1];
  B.roll(1, 0, 1); let t = 0; while (B.S.sub !== 'ask' && t < 10000) { t += 50; B.tick(t); }
  assert.equal(B.S.ask.kind, 'duck'); const prizes = B.S.ask.prizes.slice(); assert.equal(prizes.length, 3);
  B.choose(1, 2, t);
  assert.equal(B.S.tickets[1] - before, prizes[2]);
  assert.ok(evs.some(e => e.kind === 'duck' && e.pick === 2));
});

test('dice duel moves tickets from the lower roll to the higher; golden die rolls two dice', () => {
  for (let seed = 1; seed < 30; seed++) {
    const { B, evs } = match(2, seed);
    const duelAt = def.spaces.find(s => s.type === 'duel').id, prev = def.spaces.find(s => s.next[0] === duelAt).id;
    B.beginRound(0); B.S.pos[1] = prev; B.S.tickets[1] = 10; B.S.tickets[2] = 10;
    B.roll(1, 0, 1); let t = 0; while (B.S.sub !== 'fx' && t < 10000) { t += 50; B.tick(t); }
    const fx = evs.filter(e => e.ev === 'fx').pop(); assert.equal(fx.kind, 'duel');
    const [a, b] = fx.dice;
    if (a > b) assert.deepEqual([B.S.tickets[1], B.S.tickets[2]], [14, 6]); else if (a < b) assert.deepEqual([B.S.tickets[1], B.S.tickets[2]], [6, 14]); else assert.deepEqual([B.S.tickets[1], B.S.tickets[2]], [11, 11]);
  }
  const { B, evs } = match(2, 9); B.beginRound(0); B.S.boost[1] = 'gold'; B.roll(1, 0);
  const r = evs.find(e => e.ev === 'rolled'); assert.equal(r.dice.length, 2); assert.equal(r.n, r.dice[0] + r.dice[1]);
});

test('bonus ribbons: given to the leader of a stat, ties share, everyone tied = none', () => {
  const { B } = match(3, 2);
  B.S.stats[1].earned = 9; B.S.stats[2].earned = 9; B.S.stats[3].earned = 1;
  for (const k of ['walked', 'lost', 'duels', 'chance']) for (const p of [1, 2, 3]) B.S.stats[p][k] = 0;
  const aw = B.bonus({});
  assert.equal(aw.length, 1); assert.deepEqual(aw[0].pids, [1, 2]); assert.equal(B.S.ribbons[1], 1); assert.equal(B.S.ribbons[3], 0);
});
