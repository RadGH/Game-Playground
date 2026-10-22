import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES } from '../js/games/hay-bale-scramble/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 40 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, (typeof inputs === 'function' ? inputs(pid) : inputs[pid]) ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit); return r;
}
// a bot that runs to the nearest free bale once the music stops and presses A (alternating, so the press is fresh)
const bot = (g, pid, i, speed = 1) => {
  const b = g.bodies.get(pid);
  if (g.phase !== 'scramble') return { mx: 0, mz: 0, b: 0 };
  let best = null, bd = 99;
  g.bales.forEach((o, k) => { if (o !== -1) return; const at = g.bale(k), d = Math.hypot(at.x - b.x, at.z - b.z); if (d < bd) { bd = d; best = at; } });
  if (!best) return { mx: 0, mz: 0, b: 0 };
  const dx = best.x - b.x, dz = best.z - b.z, d = Math.hypot(dx, dz) || 1;
  return { mx: dx / d * speed, mz: dz / d * speed, b: d < RULES.sitR - 0.1 && i % 2 ? IN.A : 0 };
};

for (const n of [1, 2, 3, 4]) test(`${n} player(s), bots that scramble: it ends by itself, someone wins, result shape`, () => {
  const g = make(n, n + 1); let i = 0; const ev = [];
  while (!g.over && i++ < (meta.seconds + 5) / DT) ev.push(...tick(g, pid => bot(g, pid, i, pid === 40 ? 1 : 0.55 + 0.1 * (pid - 40))));
  assert.ok(g.over); assert.ok(i <= (meta.seconds + 4) / DT);
  const r = checkResult(g, n);
  if (n > 1) { assert.equal(r.order[0].length, 1, 'one winner'); assert.ok(ev.some(e => e.e === 'done' && e.win === r.order[0][0])); assert.equal(r.scores[r.order[0][0]], n - 1, 'the winner sat every round'); }
  else assert.ok(r.scores[40] >= 2, `solo sat ${r.scores[40]} rounds`);
});

test('there is one bale fewer than players; the one left standing is out and goes to the wagon', () => {
  const g = make(3, 9), [a, b, c] = g.bodies.keys(); let i = 0, ev = [];
  while (g.phase !== 'scramble' && i++ < 400) ev.push(...tick(g));
  assert.equal(g.bales.length, 2);
  assert.ok(ev.some(e => e.e === 'music') && ev.some(e => e.e === 'stop'));
  while (g.phase === 'scramble' && i++ < 400) ev.push(...tick(g, pid => pid === c ? null : bot(g, pid, i)));
  const res = ev.find(e => e.e === 'result'); assert.deepEqual(res.outs, [c]);
  assert.ok(g.bodies.get(a).flags & F.FROZEN, 'seated'); assert.equal(g.state().sc[a], 1); assert.equal(g.state().sc[c], 0);
  while (g.phase === 'result' && i++ < 400) tick(g);
  const C = g.bodies.get(c); assert.equal(C.z, RULES.wagon.z); assert.ok(C.flags & F.GHOST);
  assert.equal(g.bales.length, 1, 'next round: one bale for two'); assert.equal(g.state().out[c], 1);
});

test('pressing A while the music plays makes you stumble; a bale can hold only one', () => {
  const g = make(2, 4), [a, b] = g.bodies.keys(); let i = 0;
  while (g.phase !== 'music' && i++ < 200) tick(g);
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'stumble' && e.pid === a)); assert.ok(g.bodies.get(a).flags & F.STUN);
  while (g.phase !== 'scramble' && i++ < 400) tick(g);
  // put both right on the one bale; a presses first
  const at = g.bale(0); for (const pid of [a, b]) { const B = g.bodies.get(pid); B.x = at.x + 0.3; B.z = at.z; B.vx = B.vz = 0; }
  const ev2 = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A }, [b]: { mx: 0, mz: 0, b: IN.A } });
  assert.equal(g.bales[0], a, 'first come, first seated'); assert.ok(ev2.some(e => e.e === 'miss' && e.pid === b), 'b found it taken');
  assert.deepEqual(ev2.find(e => e.e === 'result').outs, [b]);
});

test('nobody sits: nobody is out and the round is played again', () => {
  const g = make(2, 2); let i = 0, ev = [];
  while (!ev.some(e => e.e === 'result') && i++ < 600) ev.push(...tick(g));
  assert.equal(ev.find(e => e.e === 'result').again, true);
  while (g.phase === 'result' && i++ < 400) tick(g);
  assert.equal(g.phase, 'music'); assert.equal(g.bales.length, 1);
});

test('solo: bales vanish one by one after the music stops; three misses and you are out; sitting scores a round', () => {
  const g = make(1, 6); let i = 0, ev = [];
  while (!g.over && i++ < 3000) ev.push(...tick(g));
  assert.equal(ev.filter(e => e.e === 'vanish').length, RULES.solo.bales * RULES.solo.tries, 'all five vanished, three times');
  assert.deepEqual(ev.filter(e => e.e === 'result').map(e => e.tries), [2, 1, 0]);
  assert.equal(ev.filter(e => e.e === 'music').map(e => e.k).join(), '5,5,5', 'a miss keeps the same bales');
  assert.equal(g.result().scores[40], 0);
  const g2 = make(1, 6); i = 0; const ev2 = [];
  while (!g2.over && i++ < (meta.seconds + 5) / DT) ev2.push(...tick(g2, pid => bot(g2, pid, i)));
  assert.ok(g2.result().scores[40] >= 3, `sat ${g2.result().scores[40]} rounds`);
  assert.ok(ev2.filter(e => e.e === 'music').map(e => e.k).slice(0, 3).join() === '5,4,3', 'one bale fewer every time you make it');
});

test('a barge shoves a standing player; seated players cannot be shoved', () => {
  const g = make(2, 8), [a, b] = g.bodies.keys(); let i = 0;
  while (g.phase !== 'music' && i++ < 200) tick(g);
  const A = g.bodies.get(a), B = g.bodies.get(b); A.x = 5; A.z = 0; A.yaw = Math.PI / 2; B.x = 5.9; B.z = 0;
  const ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.B } });
  assert.ok(ev.some(e => e.e === 'barge'));
  const ev2 = [...ev, ...tick(g), ...tick(g)];
  assert.ok(ev2.some(e => e.e === 'shove' && e.pid === b)); assert.ok(B.flags & F.STUN);
});
