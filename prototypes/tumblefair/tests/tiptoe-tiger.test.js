import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES } from '../js/games/tiptoe-tiger/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 30 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, (typeof inputs === 'function' ? inputs(pid) : inputs[pid]) ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit); for (const pid of g.bodies.keys()) assert.equal(typeof r.scores[pid], 'number');
  return r;
}
const fwd = { mx: 0, mz: -1, b: 0 };
// a careful player: walks only while the tiger sings, stops dead at the tell
const toBell = (g, pid) => { const b = g.bodies.get(pid), dx = RULES.bellX - b.x, dz = RULES.bellZ - b.z, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d, b: 0 }; };
const careful = (g, pid) => g.phase === 'sing' ? toBell(g, pid) : { mx: 0, mz: 0, b: 0 };

for (const n of [1, 2, 3, 4]) test(`${n} player(s) standing still: the clock ends it, everyone ties at 0 m`, () => {
  const g = make(n, n); let steps = 0;
  while (!g.over && steps < (meta.seconds + 5) / DT) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps <= (meta.seconds + 1) / DT, `${steps} steps`);
  const r = checkResult(g, n); assert.equal(r.order.length, 1);
  for (const pid of g.bodies.keys()) assert.equal(r.scores[pid], 0);
});

test('nobody can move before the first song; walking on regardless gets you roared back to the start line', () => {
  const g = make(2), [a] = g.bodies.keys(), A = g.bodies.get(a);
  for (let i = 0; i < (RULES.ready - 0.2) / DT; i++) tick(g, { [a]: fwd });
  assert.equal(A.z, RULES.startZ, 'frozen while getting ready');
  const ev = []; let i = 0;
  while (!ev.some(e => e.e === 'roar') && i++ < 400) ev.push(...tick(g, { [a]: fwd }));
  const roar = ev.find(e => e.e === 'roar'); assert.ok(roar && roar.pid === a, 'caught moving');
  assert.ok(ev.some(e => e.e === 'phase' && e.ph === 'tell'), 'there was a tell first');
  assert.ok(roar.z < RULES.startZ - 2, 'got somewhere first');
  for (let k = 0; k < RULES.flyTime / DT + 2; k++) tick(g);
  assert.equal(A.z, RULES.startZ); assert.equal(A.y, 0); assert.equal(A.flags & (F.FROZEN | F.AIR), 0, 'free again');
  assert.equal(g.state().cg[a], 1);
});

test('the careful player is never caught and rings the bell, which ends the game early with them first', () => {
  const g = make(3, 5), [a, b] = g.bodies.keys();
  const ev = []; let steps = 0;
  while (!g.over && steps++ < meta.seconds / DT) ev.push(...tick(g, pid => pid === a ? careful(g, pid) : pid === b ? fwd : null));
  assert.ok(g.over, 'ended'); assert.ok(steps < meta.seconds / DT, 'early');
  assert.ok(!ev.some(e => e.e === 'roar' && e.pid === a), 'never caught');
  assert.ok(ev.some(e => e.e === 'roar' && e.pid === b), 'the reckless one was');
  assert.equal(ev.find(e => e.e === 'bell').pid, a);
  const r = checkResult(g, 3); assert.deepEqual(r.order[0], [a]); assert.equal(r.scores[a], Math.round(RULES.startZ - RULES.bellZ));
});

test('holding A (statue) while the tiger looks is safe even with the stick pushed', () => {
  const g = make(1, 7), [a] = g.bodies.keys(); let caught = false, steps = 0, looked = 0;
  while (!g.over && steps++ < 40 / DT) {
    const ph = g.phase; if (ph === 'look') looked++;
    const ev = tick(g, { [a]: ph === 'sing' ? fwd : { mx: 0, mz: -1, b: IN.A } });
    if (ev.some(e => e.e === 'roar')) caught = true;
  }
  assert.ok(looked > 10, 'the tiger looked'); assert.ok(!caught);
});

test('fake-outs happen across seeds, and moving during one is safe', () => {
  let fakes = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = make(1, seed), [a] = g.bodies.keys(); let steps = 0;
    while (!g.over && steps++ < 60 / DT) {
      const ph = g.phase; const ev = tick(g, { [a]: ph === 'fake' ? fwd : { mx: 0, mz: 0, b: 0 } });
      if (ph === 'fake') { assert.ok(!ev.some(e => e.e === 'roar'), 'no roar in a fake'); }
      fakes += ev.filter(e => e.e === 'phase' && e.ph === 'fake').length;
    }
  }
  assert.ok(fakes >= 3, `${fakes} fake-outs`);
});

test('at the bell the winner scores the full distance; the others are ordered by distance; same seed same game', () => {
  const play = () => { const g = make(2, 11), [a, b] = g.bodies.keys(); const ev = []; let s = 0;
    while (!g.over && s++ < meta.seconds / DT) ev.push(...tick(g, pid => pid === a ? careful(g, pid) : (g.phase === 'sing' && g.bodies.get(b).z > 4 ? fwd : null)));
    return { g, a, b, ev: JSON.stringify(ev) }; };
  const x = play(), y = play();
  assert.equal(x.ev, y.ev, 'deterministic');
  const r = checkResult(x.g, 2); assert.deepEqual(r.order, [[x.a], [x.b]]); assert.ok(r.scores[x.b] > 0 && r.scores[x.b] < r.scores[x.a]);
});
