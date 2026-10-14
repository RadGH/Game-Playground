import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, PADS, RULES } from '../js/games/stack-attack/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 30 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
const run = (g, s, inputs = {}) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const press = (g, pid, bit = IN.A) => [...tick(g, { [pid]: { mx: 0, mz: 0, b: bit } }), ...tick(g)];
const place = (b, x, z, yaw) => { b.x = x; b.z = z; b.vx = b.vz = 0; if (yaw != null) b.yaw = yaw; };
const freeBlock = (g, gold = null) => g.state().k.find(k => k[4] < 0 && (gold == null || k[3] === gold));
/** Walk a player onto a free block and pick it up. */
function pickUp(g, pid, gold = null) {
  let k = null; for (let i = 0; i < 2000 && !k; i++) { k = freeBlock(g, gold); if (!k) tick(g); }
  assert.ok(k, 'a block appeared'); place(g.bodies.get(pid), k[1], k[2]);
  const ev = press(g, pid); assert.ok(ev.some(e => e.e === 'pick' && e.pid === pid), 'picked'); return k;
}
const toPad = (g, pid, seat) => place(g.bodies.get(pid), PADS[seat].x, PADS[seat].z);

for (const n of [1, 2, 3, 4]) test(`${n} player(s): ends at the clock, blocks keep coming, valid result`, () => {
  const g = make(n, n + 5);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(Math.abs(steps - meta.seconds / DT) <= 1, `${steps} steps`);
  const r = g.result(), all = r.order.flat();
  assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort()); assert.equal(r.unit, meta.unit);
  if (n > 1) assert.equal(r.order.length, 1, 'nobody stacked: all tie');
  assert.ok(g.state().k.length <= n + RULES.keepFree, 'free blocks are capped');
  for (const b of g.bodies.values()) assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd);
});

test('grab a block, carry it slower, stack it on your own pad', () => {
  const g = make(2), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  const k = pickUp(g, a);
  assert.ok(A.flags & F.CARRY);
  assert.equal(g.state().k.find(x => x[0] === k[0])[4], a, 'the state says who carries it');
  place(A, 0, 0); run(g, 1, { [a]: { mx: 1, mz: 0, b: 0 } });
  assert.ok(Math.abs(A.vx - meta.move.speed * meta.move.carryMul) < 0.05, `carrying speed ${A.vx}`);
  toPad(g, a, 0); const ev = press(g, a);
  assert.ok(ev.some(e => e.e === 'stack' && e.pid === a && e.h === 1));
  assert.equal(A.flags & F.CARRY, 0);
  const st = g.state(); assert.equal(st.sc[a], k[3] ? 2 : 1); assert.ok(!st.k.some(x => x[0] === k[0]), 'the block left the floor');
  assert.equal(g.init().tw[a].length, 1, 'the tower is in init for a phone joining late');
});

test('putting a block down off your pad leaves it on the floor; a rival pad does not count', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()];
  const k = pickUp(g, a); toPad(g, a, 1);
  const ev = press(g, a);
  assert.ok(ev.some(e => e.e === 'drop')); assert.equal(g.state().sc[a], 0); assert.equal(g.state().sc[b], 0);
  const row = g.state().k.find(x => x[0] === k[0]); assert.equal(row[4], -1, 'free again');
});

test('gold blocks count double', () => {
  const g = make(1, 12), [a] = [...g.bodies.keys()];
  pickUp(g, a, 1); toPad(g, a, 0); press(g, a);
  assert.equal(g.state().sc[a], 2); assert.equal(g.init().tw[a], '2');
});

test('a shove makes a carrier drop their block and stuns them; only in front of you', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], B = g.bodies.get(b);
  pickUp(g, b); place(B, 0, 0); place(g.bodies.get(a), -1, 0, Math.PI / 2);
  const ev = press(g, a, IN.B);
  assert.ok(ev.some(e => e.e === 'bump' && e.pid === b && e.lost === 1));
  assert.equal(B.flags & F.CARRY, 0); assert.ok(B.flags & F.STUN); assert.ok(B.vx > 3);
  // facing away: nothing
  const g2 = make(2), [c, d] = [...g2.bodies.keys()]; place(g2.bodies.get(d), 0, 0); place(g2.bodies.get(c), -1, 0, -Math.PI / 2);
  assert.ok(!press(g2, c, IN.B).some(e => e.e === 'bump'));
  // cooldown
  run(g, 0.2); assert.ok(!press(g, a, IN.B).some(e => e.e === 'shove'), 'cooling down');
});

test('empty hands on a rival pad steal the top block', () => {
  const g = make(2, 5), [a, b] = [...g.bodies.keys()];
  pickUp(g, a); toPad(g, a, 0); press(g, a);
  const before = g.state().sc[a];
  toPad(g, b, 0); const ev = press(g, b);
  assert.ok(ev.some(e => e.e === 'steal' && e.pid === b && e.from === a));
  assert.equal(g.state().sc[a], 0); assert.ok(g.bodies.get(b).flags & F.CARRY);
  toPad(g, b, 1); press(g, b); assert.equal(g.state().sc[b], before);
  // your own pad never gives a block back
  toPad(g, b, 1); assert.ok(!press(g, b).some(e => e.e === 'steal' || e.e === 'pick'));
});

test('the tallest tower wins; equal towers tie', () => {
  const g = make(3, 7), [a, b, c] = [...g.bodies.keys()];
  for (const [pid, seat, times] of [[a, 0, 2], [b, 1, 2], [c, 2, 1]]) for (let i = 0; i < times; i++) { pickUp(g, pid, 0); toPad(g, pid, seat); press(g, pid); place(g.bodies.get(pid), PADS[seat].x * 0.5, PADS[seat].z * 0.5); }
  run(g, meta.seconds + 1);
  assert.ok(g.over); assert.deepEqual(g.result().order, [[a, b], [c]]);
  assert.deepEqual(g.result().scores, { [a]: 2, [b]: 2, [c]: 1 });
});

test('state is small and rounded; towers are only sent when they change', () => {
  const g = make(4, 2); assert.ok(g.state().tw, 'the first state carries the towers'); run(g, 10);
  const st = g.state(); assert.equal(st.tw, undefined);
  const s = JSON.stringify(st); assert.ok(s.length < 400, `${s.length} bytes`); assert.ok(!/\d\.\d{3,}/.test(s));
});
