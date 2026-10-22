import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES } from '../js/games/fling-ring/sim.js';
import { DECKS } from '../js/games/fling-ring/levels.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 20 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
/** The seed that picks a deck. */
const seedFor = id => { for (let s = 1; s < 50; s++) if (make(1, s).debug.deck === id) return s; throw new Error(id); };
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const place = (b, x, z, yaw) => { b.x = x; b.z = z; b.vx = b.vz = 0; if (yaw != null) b.yaw = yaw; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit); return r;
}

test('decks are data: at least three, each a floor the sim understands', () => {
  assert.ok(DECKS.length >= 3);
  for (const d of DECKS) { assert.ok(d.id && d.name && d.theme); assert.ok(d.shape === 'circle' ? d.r > 3 : d.hw > 3 && d.hd > 3); }
  const seen = new Set(); for (let s = 1; s <= 6; s++) seen.add(make(2, s).debug.deck);
  assert.equal(seen.size, DECKS.length, 'the seed reaches every deck');
  const gi = make(2, seedFor('gaps')).init();
  assert.equal(gi.arena.shape, 'rect'); assert.ok(gi.arena.holes.length); assert.equal(gi.arena.wall, false);
});

for (const n of [1, 2, 3, 4]) for (const id of ['raft', 'carousel', 'gaps']) test(`${n} player(s) on ${id}: the clock (or the deck) ends it; nobody starts in a hole; result well formed`, () => {
  const g = make(n, seedFor(id));
  const inHole = (x, z) => (g.init().arena.holes || []).some(h => Math.abs(x - h.x) < h.hw + 0.3 && Math.abs(z - h.z) < h.hd + 0.3);
  for (const b of g.bodies.values()) assert.ok(!inHole(b.x, b.z), `start (${b.x}, ${b.z}) clear of the gaps`);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  checkResult(g, n);
});

test('hold A to lift someone, let go to fling them: far enough off the edge = a knock-out and a lost life', () => {
  const g = make(2, seedFor('raft')), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(A, 4, 0, Math.PI / 2); place(B, 4.8, 0);
  let ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'grab' && e.k === 'p' + a && e.t === 'p' + b), 'grabbed');
  assert.ok(A.flags & F.CARRY); assert.ok(B.flags & F.FROZEN);
  ev = run(g, 0.8, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(B.y > 1, 'held overhead'); assert.ok(Math.abs(B.x - A.x) < 0.5, 'carried along');
  assert.deepEqual(g.state().c, [['p' + a, 'p' + b]]);
  ev = run(g, 2.5, {});
  const thr = ev.find(e => e.e === 'throw'); assert.ok(thr && thr.p >= 0.99, 'a full-power throw');
  const fell = ev.find(e => e.e === 'fall');
  assert.ok(fell && fell.k === 'p' + b && fell.by === a, 'b went in the water, a gets it');
  assert.equal(g.state().sc[a], 1); assert.equal(g.state().lv[b], RULES.lives - 1);
  const back = [...ev, ...run(g, RULES.respawn + 0.2)].some(e => e.e === 'back' && e.k === 'p' + b);
  assert.ok(back, 'came back'); assert.equal(B.y, 0); assert.ok(Math.hypot(B.x, B.z) < 5);
});

test('a quick tap is a short toss; the hold is never shorter than the minimum', () => {
  const g = make(2, seedFor('raft')), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(A, -1, 0, Math.PI / 2); place(B, -0.2, 0);
  const ev = run(g, 1.6, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  const thr = ev.find(e => e.e === 'throw'); assert.ok(thr, 'thrown'); assert.ok(thr.p < 0.5, `weak (${thr.p})`);
  assert.ok(!ev.some(e => e.e === 'fall'), 'stayed on the raft');
});

test('mashing while carried wriggles free and dizzies the carrier', () => {
  const g = make(2, seedFor('raft')), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(A, 0, 0, 0); place(B, 0, 0.8);
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(B.flags & F.FROZEN);
  const ev = run(g, 0.6, i => ({ [a]: { mx: 0, mz: 0, b: IN.A }, [b]: { mx: 0, mz: 0, b: i % 2 ? IN.B : 0 } }));
  assert.ok(ev.some(e => e.e === 'escape' && e.t === 'p' + b), 'got out');
  assert.equal(B.flags & F.FROZEN, 0); assert.ok(A.flags & F.STUN);
  assert.equal(A.flags & F.CARRY, 0);
});

test('a shove knocks back and makes a carrier drop; a flung body bowls people over', () => {
  const g = make(3, seedFor('gaps')), [a, b, c] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b), C = g.bodies.get(c);
  g.debug.barrels.length = 0;
  place(A, -6, -5.2, 0); place(B, -6, -4.4); place(C, -4.8, -4.4, -Math.PI / 2);
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(A.flags & F.CARRY);
  // c shoves a: a drops b
  place(C, -5.2, -5.2, -Math.PI / 2);
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A }, [c]: { mx: 0, mz: 0, b: IN.B } });
  assert.ok(ev.some(e => e.e === 'shove' && e.t === 'p' + a));
  assert.ok(ev.some(e => e.e === 'drop' && e.k === 'p' + a));
  assert.equal(B.flags & F.FROZEN, 0); assert.ok(A.flags & F.STUN);
  // bowling
  const g2 = make(3, seedFor('raft')), [p, q, r] = [...g2.bodies.keys()], P = g2.bodies.get(p), Q = g2.bodies.get(q), Rb = g2.bodies.get(r);
  place(P, -4, 0, Math.PI / 2); place(Q, -3.3, 0); place(Rb, -0.5, 0);
  run(g2, 0.9, { [p]: { mx: 0, mz: 0, b: IN.A } });
  const ev2 = run(g2, 1, {});
  assert.ok(ev2.some(e => e.e === 'bowl' && e.k === 'p' + r && e.by === 'p' + p), 'bowled over');
});

test('the raft shrinks; falling down a gap on the pier costs a life', () => {
  const g = make(2, seedFor('raft'));
  const r0 = g.state().r; run(g, 40); assert.ok(g.state().r < r0 - 2, 'smaller');
  const g2 = make(2, seedFor('gaps')), [a] = [...g2.bodies.keys()], A = g2.bodies.get(a);
  g2.debug.barrels.length = 0;
  place(A, -4, -1.5);
  const ev = tick(g2);
  assert.ok(ev.some(e => e.e === 'fall' && e.k === 'p' + a && e.by == null));
});

test('the carousel carries you round and its bar bonks', () => {
  const g = make(2, seedFor('carousel')), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  place(A, 3, 0); const before = Math.atan2(A.x, A.z);
  let bonk = false; for (let i = 0; i < 160; i++) { if (tick(g).some(e => e.e === 'bonk')) bonk = true; if (!(A.flags & F.STUN)) { A.vx = A.vz = 0; } }
  assert.ok(bonk, 'the sweeper hit someone');
  const g2 = make(2, seedFor('carousel')), [b] = [...g2.bodies.keys()], B = g2.bodies.get(b);
  place(B, -2, 0); run(g2, 1); assert.ok(Math.abs(B.z) > 0.3, `turned with the floor (${B.z})`); assert.ok(Math.abs(Math.hypot(B.x, B.z) - 2) < 0.1);
});

test('solo: Bumbles appear, and throwing them in scores', () => {
  const g = make(1, seedFor('raft')), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  run(g, 2);
  const st = g.state(); assert.ok(st.d.length >= 1, 'a Bumble to throw');
  const d = [...g.debug.ents.values()].find(e => e.s.dummy && !(e.b.flags & F.GHOST)) || [...g.debug.ents.values()].find(e => e.s.dummy);
  d.b.flags &= ~F.GHOST; d.s.ghost = 0;
  place(A, 3.5, 0, Math.PI / 2); place(d.b, 4.2, 0); d.s.think = 9;
  const ev = run(g, 2.5, i => ({ [a]: { mx: 0, mz: 0, b: i < 16 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'fall' && e.k === d.key && e.by === a), 'in the water');
  assert.equal(g.state().sc[a], 1);
});

test('last one standing ends it; ranks: standing first, then knock-outs; ties share a place', () => {
  const g = make(3, seedFor('raft')), [a, b, c] = [...g.bodies.keys()], E = g.debug.ents;
  E.get('p' + b).s.lives = 1; E.get('p' + c).s.lives = 1;
  E.get('p' + b).s.kos = 2;
  place(g.bodies.get(b), 20, 0); place(g.bodies.get(c), -20, 0);
  run(g, 3);
  assert.ok(g.over, 'one left');
  const r = checkResult(g, 3);
  assert.deepEqual(r.order[0], [a]);
  assert.deepEqual(r.order[1], [b], 'more knock-outs ranks higher among the fallen');
  const g2 = make(2, seedFor('raft')); run(g2, meta.seconds + 1);
  assert.equal(checkResult(g2, 2).order.length, 1, 'nobody fell: a shared place');
});

test('same seed, same inputs, same game', () => {
  const play = () => { const g = make(4, 11); run(g, 20, i => Object.fromEntries([...g.bodies.keys()].map((p, k) => [p, { mx: Math.sin(i * 0.1 + k), mz: Math.cos(i * 0.07 + k), b: (i + k) % 9 < 4 ? IN.A : (i + k) % 13 === 0 ? IN.B : 0 }]))); return JSON.stringify(g.state()); };
  assert.equal(play(), play());
});
