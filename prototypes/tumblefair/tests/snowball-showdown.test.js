import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES } from '../js/games/snowball-showdown/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 20 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
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

for (const n of [1, 2, 3, 4]) test(`${n} player(s) standing still: the clock ends it, everyone ties`, () => {
  const g = make(n, n);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n);
  if (n > 1) assert.equal(r.order.length, 1, 'nobody fell: one shared place');
  for (const b of g.bodies.values()) assert.ok(Math.hypot(b.x, b.z) < RULES.edge);
});

test('a snowball shoves and stuns; knocking someone off scores a KO, costs them a life, and they come back as a ghost', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(A, 3, 0, Math.PI / 2); place(B, 6, 0);
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'throw' && e.pid === a));
  assert.equal(g.state().s.length, 1, 'the snowball is in the state');
  const ev2 = run(g, 0.4);
  assert.ok(ev2.some(e => e.e === 'hit' && e.pid === b && e.by === a), 'it hit');
  assert.ok(B.vx > 4, `pushed away (${B.vx})`); assert.ok(B.flags & F.STUN, 'stunned');
  const ev3 = [...ev2]; for (let i = 0; i < 60 && !ev3.some(e => e.e === 'fall'); i++) ev3.push(...tick(g));
  const fell = ev3.find(e => e.e === 'fall');
  assert.ok(fell && fell.pid === b && fell.by === a, 'b slid off, a gets the KO');
  let st = g.state(); assert.equal(st.sc[a], 1); assert.equal(st.lv[b], RULES.lives - 1);
  run(g, RULES.respawn + 0.1);
  assert.ok(B.flags & F.GHOST, 'back, blinking'); assert.ok(Math.hypot(B.x, B.z) < 4.5); assert.equal(B.y, 0);
  // a ghost cannot be hit
  place(A, B.x - 2, B.z, Math.PI / 2);
  const ev4 = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(!ev4.some(e => e.e === 'hit'), 'passed through the ghost');
  run(g, RULES.ghost); assert.equal(B.flags & F.GHOST, 0, 'solid again');
  st = g.state(); assert.equal(st.sc[a], 1);
});

test('the throw has a cooldown; holding the button throws once', () => {
  const g = make(1), [a] = [...g.bodies.keys()];
  const ev = run(g, 0.5, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.equal(ev.filter(e => e.e === 'throw').length, 1);
  const ev2 = run(g, 1.3, i => ({ [a]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } }));
  const n = ev2.filter(e => e.e === 'throw').length; assert.ok(n >= 2 && n <= 3, `${n} throws in 1.3 s of mashing`);
});

test('a dash barges into someone; falling with nobody to blame scores nothing', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(A, -2, 0, Math.PI / 2); place(B, 0, 0);
  const ev = run(g, 0.4, i => ({ [a]: { mx: 1, mz: 0, b: i === 0 ? IN.B : 0 } }));
  assert.ok(ev.some(e => e.e === 'shove' && e.pid === b && e.by === a));
  assert.ok(B.vx > 4); assert.ok(B.flags & F.STUN);
  const g2 = make(2), [c] = [...g2.bodies.keys()]; place(g2.bodies.get(c), 9, 0);
  const ev2 = tick(g2); assert.equal(ev2.find(e => e.e === 'fall').by, -1);
  assert.equal(Object.values(g2.state().sc).reduce((s, v) => s + v, 0), 0);
});

test('losing every life ends it early; order is lives, then KOs', () => {
  const g = make(3), [a, b, c] = [...g.bodies.keys()];
  // c goes off the edge three times, b once
  let falls = 0;
  for (let i = 0; i < 400 && !g.over; i++) {
    const C = g.bodies.get(c), B = g.bodies.get(b);
    if (C.y === 0 && !(C.flags & (F.OUT | F.STUN)) && falls < RULES.lives) { place(C, 9, 0); falls++; }
    if (i === 5) place(B, -9, 0);
    tick(g);
  }
  assert.equal(g.state().lv[c], 0); assert.equal(g.state().lv[b], RULES.lives - 1);
  assert.equal(g.over, false, 'two still in');
  // b goes off twice more -> one left
  for (let i = 0; i < 600 && !g.over; i++) { const B = g.bodies.get(b); if (B.y === 0 && !(B.flags & (F.OUT | F.STUN))) place(B, 9, 0); tick(g); }
  assert.ok(g.over, 'one player left with lives');
  assert.deepEqual(checkResult(g, 3).order, [[a], [b], [c]]);
});

test('solo: snowmen pop up and knocking one off scores', () => {
  const g = make(1, 8), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  run(g, 1);
  let pops = 0;
  for (let i = 0; i < 400 && pops < 2; i++) {
    const sm = g.state().sm.find(s => s[3] === 0);
    if (sm && i % 6 === 0) { const d = Math.hypot(sm[1], sm[2]) || 1, nx = sm[1] / d, nz = sm[2] / d; place(A, sm[1] - nx * 1.6, sm[2] - nz * 1.6, Math.atan2(nx, nz)); }
    pops += tick(g, { [a]: { mx: 0, mz: 0, b: i % 6 === 1 ? IN.A : 0 } }).filter(e => e.e === 'pop').length;
  }
  assert.ok(pops >= 2, `${pops} snowmen popped`);
  assert.equal(g.state().sc[a], pops);
});

test('state is small and rounded', () => {
  const g = make(4, 2); run(g, 5, i => Object.fromEntries([...g.bodies.keys()].map(p => [p, { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 }])));
  const s = JSON.stringify(g.state()); assert.ok(s.length < 400, `${s.length} bytes`); assert.ok(!/\d\.\d{3,}/.test(s));
});
