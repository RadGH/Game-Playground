import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, GOLD, GREY } from '../js/games/balloon-stampede/sim.js';

const make = (n, seed = 3, seats = null) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: seats ? seats[i] : i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs() : inputs)); return ev; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  for (let i = 1; i < r.order.length; i++) assert.ok(r.scores[r.order[i - 1][0]] > r.scores[r.order[i][0]], 'best first');
  for (const grp of r.order) assert.equal(new Set(grp.map(p => r.scores[p])).size, 1, 'a group shares a score');
  return r;
}
/** A bot that walks to the nearest balloon it wants (its own colour or gold) and steers round the others. */
function picky(g, pid, seat) {
  return () => {
    const b = g.bodies.get(pid), st = g.state(); let best = null, bd = 1e9;
    for (const [, x, z, c] of st.bl) if (c === seat || c === GOLD) { const d = Math.hypot(x - b.x, z - b.z); if (d < bd) { bd = d; best = [x, z]; } }
    if (!best) return { mx: 0, mz: 0, b: 0 };
    let mx = (best[0] - b.x) / bd, mz = (best[1] - b.z) / bd;
    for (const [, x, z, c] of st.bl) { if (c === seat || c === GOLD) continue; const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz); if (d < 1.8) { mx += dx / d * (1.8 - d) * 1.5; mz += dz / d * (1.8 - d) * 1.5; } }
    const m = Math.hypot(mx, mz) || 1; return { mx: mx / m, mz: mz / m, b: 0 };
  };
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s): runs to the bell with a valid result, only seated colours (and gold) float`, () => {
  const g = make(n, 40 + n);
  const seen = new Set(); let steps = 0;
  const bots = [...g.bodies.keys()].map((pid, i) => picky(g, pid, i));
  while (!g.over && steps < meta.seconds / DT + 5) { const inp = {}; [...g.bodies.keys()].forEach((pid, i) => { inp[pid] = bots[i](); }); tick(g, inp); for (const b of g.state().bl) seen.add(b[3]); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  for (const c of seen) assert.ok(c < n || c === GOLD || (n === 1 && c === GREY), `colour ${c} with ${n} players`);
  if (n === 1) assert.ok(seen.has(GREY), 'solo has grey decoys'); else assert.ok(!seen.has(GREY), 'no greys with rivals');
  const r = checkResult(g, n), st = g.state();
  assert.equal(st.left, 0);
  for (const v of Object.values(r.scores)) assert.ok(v > 0, 'a picky player scores');
  assert.ok(st.bl.length <= RULES.perField + RULES.perPlayer * n);
});

test('seated colours are kept even, and a balloon\'s colour follows the SEAT (seats 1 and 3 only)', () => {
  const g = make(2, 5, [1, 3]); run(g, 10);
  const c = g.state().bl.map(b => b[3]).filter(x => x !== GOLD);
  assert.ok(c.every(x => x === 1 || x === 3), JSON.stringify(c));
  const k1 = c.filter(x => x === 1).length, k3 = c.filter(x => x === 3).length; assert.ok(Math.abs(k1 - k3) <= 2, `${k1} vs ${k3}`);
});

/** Put player `pid` on top of the first balloon of colour `c` and step once; returns the pop event. */
function popOne(g, pid, c) {
  for (let k = 0; k < 600; k++) {
    const bl = g.state().bl.find(b => b[3] === c);
    if (bl) {
      for (const [q, b] of g.bodies) if (q !== pid) { b.x = 7.5; b.z = q % 2 ? 6 : -6; }      // the others well away
      const b = g.bodies.get(pid); b.x = bl[1]; b.z = bl[2];
      const e = tick(g).find(e2 => e2.e === 'pop' && e2.c === c); if (e) return e;
    } else tick(g, {});
  }
  return null;
}
test('scoring: own +1, gold +3, someone else\'s -1 for you and +1 for them', () => {
  const g = make(2, 7), [a, b] = [...g.bodies.keys()], sc = () => g.state().sc;
  let e = popOne(g, a, 0); assert.ok(e); assert.equal(e.d, 1); assert.deepEqual([sc()[a], sc()[b]], [1, 0]);
  e = popOne(g, a, 1); assert.ok(e); assert.equal(e.d, -1); assert.equal(e.gift, b); assert.deepEqual([sc()[a], sc()[b]], [0, 1]);
  e = popOne(g, b, GOLD); assert.ok(e, 'a golden one came'); assert.equal(e.d, 3); assert.equal(sc()[b], 4);
});

test('solo: grey decoys cost a point', () => {
  const g = make(1, 9), [a] = g.bodies.keys();
  const e = popOne(g, a, GREY); assert.ok(e); assert.equal(e.d, -1); assert.equal(g.state().sc[a], -1);
});

test('a dash barges a rival into a slide; balloons never leave the room', () => {
  const g = make(2, 4), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  A.x = -2; A.z = 0; B.x = 0; B.z = 0; A.yaw = Math.PI / 2;
  let ev = tick(g, { [a]: { mx: 1, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'dash' && e.pid === a)); assert.ok(A.flags & F.AIR);
  ev = ev.concat(run(g, 0.3, { [a]: { mx: 1, mz: 0, b: IN.A } }));
  assert.ok(ev.some(e => e.e === 'barge' && e.pid === b && e.by === a), 'barged');
  assert.ok(B.x > 0.8, `b slid to ${B.x}`);
  run(g, 1); assert.equal(B.flags & F.STUN, 0, 'b gets up'); assert.equal(A.flags & (F.STUN | F.AIR), 0, 'the dash ends');
  // held button: no second dash until released and cooled
  ev = run(g, RULES.dashCool + 0.2, { [a]: { mx: 1, mz: 0, b: IN.A } }); assert.ok(!ev.some(e => e.e === 'dash'));
  const h = make(3, 6); run(h, 40, () => { for (const [, x, z] of h.state().bl) { assert.ok(Math.abs(x) <= meta.arena.hw && Math.abs(z) <= meta.arena.hd); } return {}; });
});

test('ties share a place; nobody scoring is a four-way tie', () => {
  const park = g => { while (!g.over) { for (const b of g.bodies.values()) { b.x = 50; b.z = 50; } g.step(DT); g.events.length = 0; } };   // off in a corridor no balloon reaches
  const g = make(4, 2); park(g);
  assert.deepEqual(checkResult(g, 4).order.map(x => x.length), [4]);
  const t = make(3, 8), [p, q, r] = [...t.bodies.keys()];
  assert.ok(popOne(t, p, 0)); assert.ok(popOne(t, q, 1)); park(t);
  const res = checkResult(t, 3);
  assert.deepEqual(res.order.map(x => [...x].sort()), [[p, q].sort(), [r]]); assert.equal(res.scores[p], 1);
});

test('state is small and rounded', () => {
  const g = make(4, 2); run(g, 20, {});
  const s = JSON.stringify(g.state());
  assert.ok(s.length < 420, `${s.length} bytes`);
  assert.ok(!/\d\.\d{2,}/.test(s), 'one decimal');
});
