import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, bonusFor } from '../js/games/lantern-leap/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 50 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) { for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 }); g.step(DT); return g.events.splice(0); }
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const place = (b, x, z) => { b.x = x; b.z = z; b.vx = b.vz = 0; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort()); assert.equal(r.unit, meta.unit);
  const sc = r.order.map(grp => r.scores[grp[0]]); for (let i = 1; i < sc.length; i++) assert.ok(sc[i] < sc[i - 1]);
  return r;
}
/** A coin-chaser that leaps now and then. */
function bot(g, step) {
  const out = {};
  for (const [pid, b] of g.bodies) {
    let best = null, bd = 99; for (const c of g._coins) { const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < bd) { bd = d; best = c; } }
    let mx = 0, mz = 0; if (best) { mx = best.x - b.x; mz = best.z - b.z; const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m; }
    out[pid] = { mx, mz, b: (step + pid) % 14 === 0 ? IN.A : 0 };
  }
  return out;
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s) waiting on the dock: nobody falls in, the clock ends it, all tie at 0`, () => {
  const g = make(n, 3 + n); let steps = 0, splashes = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { splashes += tick(g).filter(e => e.e === 'splash').length; steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1); assert.equal(splashes, 0);
  const r = g.result(); assert.equal(r.order.length, 1); assert.equal(r.order[0].length, n);
  for (const b of g.bodies.values()) assert.ok(b.z >= RULES.dock, 'still on the dock');
});

for (const n of [1, 2, 4]) test(`${n} coin-chasing bot(s): pads keep coming, coins get picked up, the result is ordered`, () => {
  const g = make(n, 11); let i = 0, minPads = 99;
  const ev = run(g, meta.seconds + 1, () => { i++; for (let l = 0; l < 4; l++) minPads = Math.min(minPads, g._pads.filter(p => p.lane === l && p.y > RULES.drown).length); return bot(g, i); });
  assert.ok(g.over); checkResult(g, n);
  assert.ok(ev.filter(e => e.e === 'get').length >= 10, 'coins collected');
  assert.ok(minPads >= 2, `every lane always has pads (${minPads})`);
  for (const b of g.bodies.values()) assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd);
});

test('a pad you stand on wobbles and then sinks; you ride it while it floats; stepping off into water splashes you back to the dock', () => {
  const g = make(1), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  const pad = g._pads.find(p => p.lane === 1 && Math.abs(p.x) < 3);
  place(A, pad.x, pad.z);
  const x0 = pad.x, ax0 = A.x;
  let ev = tick(g);
  assert.ok(ev.some(e => e.e === 'step' && e.id === pad.id)); assert.ok(pad.t >= 0);
  run(g, 0.8);
  assert.ok(Math.abs((A.x - ax0) - (pad.x - x0)) < 0.05, 'carried along with the pad');
  const row = () => g.state().pd.find(r => r[0] === pad.id);
  run(g, RULES.wobble + 0.1 - 0.85); assert.ok(row()[4] > 0.05 || row()[4] === 0.05, 'wobbling');
  ev = run(g, RULES.sink - RULES.wobble + 0.6);
  assert.ok(ev.some(e => e.e === 'splash' && e.pid === a), 'it sank under them');
  assert.ok(A.flags & F.STUN);
  ev = run(g, RULES.splashT + 0.1);
  assert.ok(ev.some(e => e.e === 'back')); assert.ok(A.z >= RULES.dock && A.y === 0); assert.ok(A.flags & F.GHOST);
});

test('a leap clears water that walking would fall into; you cannot leap again mid-air', () => {
  const g = make(1, 4), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  for (const p of g._pads) if (p.lane <= 1) { p.x = 50; }                     // clear lanes 0-1 so there is open water in front of the dock
  place(A, 0, RULES.dock + 0.2);
  const ev = run(g, 0.45, i => ({ [a]: { mx: 0, mz: -1, b: i === 0 || i === 3 ? IN.A : 0 } }));
  assert.equal(ev.filter(e => e.e === 'leap').length, 1);
  assert.ok(A.z < RULES.dock - 1.5, `flew out over the water (z ${A.z})`); assert.ok(A.y > 0);
  assert.ok(!ev.some(e => e.e === 'splash'), 'no splash while in the air');
  const ev2 = run(g, 0.4); assert.ok(ev2.some(e => e.e === 'splash'), 'and down into the water');
});

test('streak: pickups in a row are worth more; a splash loses the streak', () => {
  assert.equal(bonusFor(0), 0); assert.equal(bonusFor(RULES.streakStep), 1); assert.equal(bonusFor(99), RULES.streakMax);
  const g = make(1, 6), [a] = [...g.bodies.keys()], A = g.bodies.get(a), s = g._P.get(a);
  const pad = g._pads.find(p => p.lane === 2 && Math.abs(p.x) < 4);
  let got = 0;
  for (let k = 0; k < RULES.streakStep + 1; k++) {
    g._coins.push({ id: 500 + k, pad: pad.id, ox: 0, oz: 0, x: pad.x, z: pad.z, k: 0 }); pad.t = -1; pad.y = 0;
    place(A, pad.x, pad.z); const ev = tick(g); const e = ev.find(x => x.e === 'get'); assert.ok(e); got += e.d;
  }
  assert.equal(got, RULES.streakStep + 2, 'the fifth pickup in a row is worth 2'); assert.equal(s.streak, RULES.streakStep + 1);
  place(A, 0, (RULES.lanes[0].z + RULES.lanes[1].z) / 2); for (const p of g._pads) if (Math.hypot(p.x - A.x, p.z - A.z) < 3) p.x += 30;
  const ev = tick(g); assert.ok(ev.some(e => e.e === 'splash' && e.lost === RULES.streakStep + 1)); assert.equal(s.streak, 0);
});

test('fireflies are worth 3; ties share a place', () => {
  const g = make(2, 7), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a);
  const pad = g._pads.find(p => p.lane === 1 && Math.abs(p.x) < 4);
  g._coins.push({ id: 700, pad: pad.id, ox: 0, oz: 0, x: pad.x, z: pad.z, k: 1 }); place(A, pad.x, pad.z);
  const ev = tick(g); assert.equal(ev.find(e => e.e === 'get').d, 3);
  g._P.get(b).score = 3; assert.deepEqual(g.result().order, [[a, b]]);
});

test('same seed, same inputs: the same match; state is small', () => {
  const x = make(4, 12), y = make(4, 12); let i = 0, j = 0;
  run(x, 20, () => bot(x, i++)); run(y, 20, () => bot(y, j++));
  assert.deepEqual(x.state(), y.state()); assert.ok(JSON.stringify(x.state()).length < 1800, JSON.stringify(x.state()).length);
});
