import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, sidesFor, CPU } from '../js/games/rope-rumble/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 60 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) { for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 }); g.step(DT); return g.events.splice(0); }
/** Drive a match: `who(pid, beat)` -> q (2 perfect, 1 good, 0 = no tap) — each player taps once per beat, judged like a phone would. */
function play(g, who, maxS = meta.seconds + 1) {
  const ev = [], done = new Map();
  for (let i = 0; i < maxS / DT && !g.over; i++) {
    const nb = Math.round(g._bt);
    if (g._ph === 'pull') for (const pid of g.bodies.keys()) { if (done.get(pid) === nb) continue; const q = who(pid, nb); if (q) { g.act(pid, 'pull', { n: nb, q }); done.set(pid, nb); } }
    ev.push(...tick(g));
  }
  return ev;
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort()); assert.equal(r.unit, meta.unit);
  return r;
}

test('sides: solo vs the strongman, 1v1, a three-way star, 2v2', () => {
  const ps = n => Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i }));
  assert.deepEqual(sidesFor(ps(1)).map(s => s.pids), [[1], [CPU]]);
  assert.deepEqual(sidesFor(ps(2)).map(s => s.pids), [[1], [2]]);
  const three = sidesFor(ps(3)); assert.equal(three.length, 3);
  const sum = three.reduce((a, s) => [a[0] + s.dir[0], a[1] + s.dir[1]], [0, 0]); assert.ok(Math.hypot(...sum) < 0.05, 'the star is balanced');
  assert.deepEqual(sidesFor(ps(4)).map(s => s.pids), [[1, 2], [3, 4]]);
  for (const n of [1, 2, 3, 4]) { const g = make(n); for (const b of g.bodies.values()) assert.ok(b.flags & F.FROZEN, 'everyone holds the rope'); }
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s) never tapping: ends by itself within the time; result covers everyone`, () => {
  const g = make(n, 4 + n); let steps = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n);
  if (n === 1) assert.equal(r.scores[60], 0, 'the strongman won every pull');
  else for (const v of Object.values(r.scores)) assert.equal(v, 0, 'nobody pulled: every pull a draw');
});

test('solo: steady perfect rhythm beats the strongman two pulls to none, and it ends early', () => {
  const g = make(1); let steps = 0;
  const ev = play(g, () => 2);
  assert.ok(g.over);
  const wins = ev.filter(e => e.e === 'win'); assert.equal(wins.length, 2); assert.ok(wins.every(w => w.side === 0));
  assert.deepEqual(g.result().scores, { 60: 2 }); assert.deepEqual(g.result().order, [[60]]);
});

test('1v1: perfect rhythm beats wild mashing (extra taps per beat do nothing)', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()];
  // b mashes: three taps a beat but only the first counts, and mashing lands off the beat (good, not perfect)
  const ev = [], last = new Map();
  for (let i = 0; i < (meta.seconds + 1) / DT && !g.over; i++) {
    const nb = Math.round(g._bt);
    if (g._ph === 'pull') {
      if (last.get(a) !== nb) { g.act(a, 'pull', { n: nb, q: 2 }); last.set(a, nb); }
      for (let k = 0; k < 3; k++) g.act(b, 'pull', { n: nb, q: 1 });
    }
    ev.push(...tick(g));
  }
  let r0 = 0; const counted = []; for (const e of ev) { if (e.e === 'round') r0 = e.r; if (e.e === 'pull' && e.pid === b) counted.push(r0 + ':' + e.n); }
  assert.equal(new Set(counted).size, counted.length, 'one pull per beat each');
  const r = checkResult(g, 2); assert.equal(r.scores[a], 2); assert.equal(r.scores[b], 0); assert.deepEqual(r.order, [[a], [b]]);
});

test('2v2: the team that pulls wins together; teammates share a place', () => {
  const g = make(4), [a, b, c, d] = [...g.bodies.keys()];
  play(g, pid => (pid === c || pid === d ? 2 : pid === a ? 1 : 0));
  const r = checkResult(g, 4); assert.deepEqual(r.order.map(x => x.sort()), [[c, d], [a, b]]); assert.equal(r.scores[c], 2);
});

test('3-way star: the strongest puller wins; a tie on pulls goes to whoever heaved harder', () => {
  const g = make(3), [a, b, c] = [...g.bodies.keys()];
  play(g, pid => (pid === b ? 2 : pid === a ? 1 : 0));
  const r = checkResult(g, 3); assert.equal(r.order[0][0], b); assert.equal(r.scores[b], 2);
  assert.deepEqual(r.order.flat(), [b, a, c]);
});

test('beats out of range, before PULL, or repeated are refused; the fallback A press still pulls', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()];
  g.act(a, 'pull', { n: 4, q: 2 }); assert.equal(g._P.get(a).pulls, 0, 'not during the count-in');
  while (g._ph !== 'pull') tick(g);
  g.act(a, 'pull', { n: 50, q: 2 }); g.act(a, 'pull', { n: 'x', q: 2 }); g.act(a, 'pull', { n: 4, q: 7 }); g.act(a, 'pull', null);
  assert.equal(g._P.get(a).pulls, 0);
  g.act(a, 'pull', { n: 4, q: 2 }); g.act(a, 'pull', { n: 4, q: 2 }); assert.equal(g._P.get(a).pulls, 1);
  // b has no view: a plain press is judged on the server's beat after a moment
  const ev = []; ev.push(...tick(g, { [b]: { mx: 0, mz: 0, b: IN.A } })); for (let i = 0; i < 8; i++) ev.push(...tick(g, { [b]: { mx: 0, mz: 0, b: IN.A } }));
  assert.equal(ev.filter(e => e.e === 'pull' && e.pid === b).length, 1, 'held button = one pull');
  // once a phone has sent a judged pull, its raw presses are ignored (no double counting)
  const ev2 = []; for (let i = 0; i < 10; i++) ev2.push(...tick(g, { [a]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } }));
  assert.equal(ev2.filter(e => e.e === 'pull' && e.pid === a).length, 0);
});

test('a pull that runs out of time goes to the side the ribbon leans toward', () => {
  const g = make(2), [a] = [...g.bodies.keys()];
  const ev = play(g, (pid, nb) => (pid === a && nb >= 4 && nb <= 8 && nb % 2 === 0 ? 1 : 0), 17);
  const st = g.state(); assert.equal(st.w[0], 1, 'a dragged it a little way and won on time');
  const go = ev.findIndex(e => e.e === 'go'), win = ev.findIndex(e => e.e === 'win'); assert.ok(go >= 0 && win > go);
  assert.ok(Math.abs(g._knot[0]) < RULES.line, 'the ribbon never reached the line');
});

test('same seed, same taps: the same match; state is small', () => {
  const x = make(3, 9), y = make(3, 9), who = (pid, nb) => ((pid + nb) % 3 ? 2 : 1);
  play(x, who, 20); play(y, who, 20);
  assert.deepEqual(x.state(), y.state()); assert.ok(JSON.stringify(x.state()).length < 300);
});
