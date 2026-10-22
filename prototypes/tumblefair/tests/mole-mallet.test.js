import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, KIND, HOLES } from '../js/games/mole-mallet/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 40 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) { for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 }); g.step(DT); return g.events.splice(0); }
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const place = (b, x, z, yaw) => { b.x = x; b.z = z; b.vx = b.vz = 0; if (yaw != null) b.yaw = yaw; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort()); assert.equal(r.unit, meta.unit);
  const sc = r.order.map(grp => r.scores[grp[0]]); for (let i = 1; i < sc.length; i++) assert.ok(sc[i] < sc[i - 1], 'best first, no split ties');
  return r;
}
/** Stand just south of a mole's hole facing it. */
const standAt = (b, hole) => place(b, HOLES[hole].x, HOLES[hole].z + 0.5, Math.PI);
/** A bot that runs to the nearest up mole that is not a bomb and bonks it. */
function bot(g) {
  const out = {}, st = g.state();
  for (const [pid, b] of g.bodies) {
    let best = null, bd = 99;
    for (const [, hole, kind, h] of st.ml) if (kind !== KIND.BOMB && h > 0.5) { const H = HOLES[hole], d = Math.hypot(H.x - b.x, H.z - (b.z - 0.5)); if (d < bd) { bd = d; best = H; } }
    if (!best) { out[pid] = { mx: 0, mz: 0, b: 0 }; continue; }
    const dx = best.x - b.x, dz = best.z + 0.5 - b.z, d = Math.hypot(dx, dz);
    out[pid] = d > 0.3 ? { mx: dx / d, mz: dz / d, b: 0 } : { mx: 0, mz: -0.1, b: g._P.get(pid).cool <= 0 ? IN.A : 0 };
  }
  return out;
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s) doing nothing: moles come and go, the clock ends it, everyone ties at 0`, () => {
  const g = make(n, 5 + n); let steps = 0, most = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; most = Math.max(most, g._moles.filter(m => m.st === 'up').length); }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  assert.ok(most >= RULES.up[n === 1 ? 1 : n] - 1, `lots of moles up at once (${most})`);
  const r = g.result(); assert.equal(r.order.length, 1); assert.equal(r.order[0].length, n);
});

for (const n of [1, 2, 4]) test(`${n} bonking bot(s) score; result order matches the scores`, () => {
  const g = make(n, 2); run(g, meta.seconds + 1, () => bot(g));
  assert.ok(g.over);
  const r = checkResult(g, n);
  for (const v of Object.values(r.scores)) assert.ok(v >= 5, `every bot bonks a few (${JSON.stringify(r.scores)})`);
});

test('bonking: a brown mole is +1, gold +3, a bomb stuns you and scores nothing; a miss scores nothing', () => {
  const g = make(1), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  g._moles.length = 0;
  const pop = (hole, kind) => { const m = { id: 900 + hole, hole, kind, age: 0.5, life: 3, st: 'up', by: -1 }; g._moles.push(m); return m; };
  const m1 = pop(0, KIND.MOLE); standAt(A, 0);
  let ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'bonk' && e.d === 1)); assert.equal(m1.st, 'bonked'); assert.equal(g.state().sc[a], 1);
  run(g, 0.5);
  pop(7, KIND.GOLD); standAt(A, 7); ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'bonk' && e.d === 3)); assert.equal(g.state().sc[a], 4);
  run(g, 0.5);
  pop(12, KIND.BOMB); standAt(A, 12); ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'boom')); assert.ok(A.flags & F.STUN); assert.equal(g.state().sc[a], 4);
  // dizzy: cannot swing
  ev = run(g, 0.6, i => ({ [a]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } })); assert.ok(!ev.some(e => e.e === 'swing'));
  run(g, RULES.bombStun);
  assert.equal(A.flags & F.STUN, 0, 'better again');
  g._moles.length = 0; ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'swing') && !ev.some(e => e.e === 'bonk')); assert.equal(g.state().sc[a], 4);
});

test('a mole that has ducked back down cannot be bonked; holding the button swings once', () => {
  const g = make(1), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  g._moles.length = 0; g._moles.push({ id: 1, hole: 3, kind: KIND.MOLE, age: 2.99, life: 3, st: 'up', by: -1 }); standAt(A, 3);
  run(g, 0.1); const ev = run(g, 0.6, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.equal(ev.filter(e => e.e === 'swing').length, 1); assert.ok(!ev.some(e => e.e === 'bonk'));
});

test('bonking a player makes them dizzy, then they cannot be bonked again for a moment', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  g._moles.length = 0; place(A, 0, 0, Math.PI / 2); place(B, 0.9, 0);
  RULES.every = 99;
  try {
    let ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
    assert.ok(ev.some(e => e.e === 'bop' && e.pid === b && e.by === a)); assert.ok(B.flags & F.STUN);
    run(g, RULES.bopStun + 0.1); place(A, 0, 0, Math.PI / 2); place(B, 0.9, 0);
    assert.equal(B.flags & F.STUN, 0); assert.ok(B.flags & F.GHOST, 'blinking');
    ev = run(g, 0.5, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
    assert.ok(!ev.some(e => e.e === 'bop'), 'no stun-lock');
    run(g, RULES.bopSafe); assert.equal(B.flags & F.GHOST, 0);
    assert.equal(g.state().sc[a], 0, 'bonking people scores nothing');
  } finally { RULES.every = 0.22; }
});

test('two players tied on points share a place', () => {
  const g = make(3), [a, b, c] = [...g.bodies.keys()];
  g._P.get(a).score = 5; g._P.get(b).score = 5; g._P.get(c).score = 2;
  const r = g.result(); assert.deepEqual(r.order, [[a, b], [c]]);
});

test('same seed, same inputs: the same match; state is small', () => {
  const x = make(4, 9), y = make(4, 9);
  run(x, 20, () => bot(x)); run(y, 20, () => bot(y));
  assert.deepEqual(x.state(), y.state()); assert.ok(JSON.stringify(x.state()).length < 600);
});
