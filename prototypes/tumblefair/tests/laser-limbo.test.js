import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, LOW, HIGH, SWEEP, SPIN, beamDist, catches, pace } from '../js/games/laser-limbo/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs() : inputs)); return ev; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}

test('the beam rules: which line is where, and who it catches', () => {
  assert.equal(beamDist({ k: SWEEP, a: 0, s: 2 }, 2, 5), 0, 'a sweep at angle 0 is the line x = s');
  assert.equal(beamDist({ k: SPIN, a: 0 }, 4, 0), 0, 'a spinner at angle 0 runs along x');
  const ground = { flags: 0, y: 0 }, air = { flags: F.AIR, y: 0.9 }, takeoff = { flags: F.AIR, y: 0.1 };
  assert.ok(catches(LOW, ground, false)); assert.ok(!catches(LOW, air, false)); assert.ok(catches(LOW, takeoff, false), 'barely off the ground: still caught');
  assert.ok(catches(LOW, ground, true), 'ducking does not help against a low beam');
  assert.ok(catches(HIGH, ground, false)); assert.ok(!catches(HIGH, ground, true)); assert.ok(catches(HIGH, air, false), 'hopping into a high beam');
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): standing still, the lasers end it inside the clock with a valid result`, () => {
  const g = make(n, 40 + n);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over, 'ended'); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n);
  for (const v of Object.values(r.scores)) assert.ok(v >= 0 && v <= meta.seconds);
  assert.ok(g.state().left >= 0);
});

test('an idle player is zapped by the first beam that reaches the middle; a beam warns before it bites', () => {
  const g = make(1, 5); const [a] = g.bodies.keys();
  const ev = run(g, 12);
  const z = ev.find(e => e.e === 'zap'); assert.ok(z, 'zapped'); assert.equal(z.pid, a);
  assert.ok(g.bodies.get(a).flags & F.OUT); assert.ok(g.over, 'solo: out = over');
  assert.ok(g.result().scores[a] >= Math.floor(RULES.start), 'survived until the first beam arrived');
});

/** A bot that reads the beams: hops a low one and crouches under a high one when its line is about to reach it. */
function dodger(g, pid) {
  return () => {
    const st = g.state(), b = g.bodies.get(pid); let bits = 0;
    for (const [, k, h, a, s, v, warn] of st.bm) {
      if (warn > 0) continue;
      const d = beamDist({ k, a, s }, b.x, b.z);
      const near = k === SWEEP ? d > -0.45 && d < 0.3 + v * 0.22 : Math.abs(d) < 0.45 + Math.abs(v) * 0.3;
      if (near) bits |= h === LOW ? IN.A : IN.B;
    }
    if ((bits & IN.A) && (bits & IN.B)) bits = IN.B;
    return { [pid]: { mx: 0, mz: 0, b: bits } };
  };
}
test('hopping low beams and ducking high ones keeps you alive far longer than standing still', () => {
  let idleT = 0, smartT = 0;
  for (const seed of [8, 9, 10, 12]) {
    const idle = make(1, seed), [i] = idle.bodies.keys(); run(idle, 61); idleT += idle.result().scores[i];
    const smart = make(1, seed), [p] = smart.bodies.keys(); run(smart, 61, dodger(smart, p)); smartT += smart.result().scores[p];
  }
  assert.ok(smartT > idleT * 1.8 + 8, `dodging ${smartT}s vs idle ${idleT}s over four games`);
});

test('a hop clears a low beam; a crouch clears a high beam and slows you', () => {
  const g = make(1, 2), [a] = g.bodies.keys(), body = g.bodies.get(a);
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(body.flags & F.AIR);
  run(g, 0.2); assert.ok(body.y > RULES.clear, `in the air at ${body.y}`);
  assert.equal(catches(LOW, body, false), false);
  run(g, RULES.hop); assert.equal(body.flags & F.AIR, 0, 'landed');
  tick(g, { [a]: { mx: 1, mz: 0, b: IN.B } }); assert.ok(body.flags & F.CARRY, 'crouched');
  run(g, 0.6, { [a]: { mx: 1, mz: 0, b: IN.B } });
  assert.ok(Math.hypot(body.vx, body.vz) <= meta.move.speed * meta.move.carryMul + 1e-6, 'slow while crouched');
  assert.equal(catches(HIGH, body, true), false);
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.B | IN.A } }); assert.equal(body.flags & F.AIR, 0, 'no hop while crouched');
  run(g, RULES.duckMin + 0.1); assert.equal(body.flags & F.CARRY, 0, 'let go: stands up');
});

test('last one standing wins early; the zapped are ranked by when they were zapped', () => {
  for (const seed of [11, 12, 13]) {
    const g = make(4, seed); let steps = 0; const at = new Map();
    while (!g.over && steps < 1300) { steps++; for (const e of tick(g)) if (e.e === 'zap') at.set(e.pid, steps); }
    assert.ok(g.over);
    const r = checkResult(g, 4);
    const key = pid => at.get(pid) ?? Infinity;
    for (const grp of r.order) assert.equal(new Set(grp.map(key)).size, 1, 'a group was zapped in the same step');
    for (let i = 1; i < r.order.length; i++) assert.ok(key(r.order[i - 1][0]) > key(r.order[i][0]), 'later zaps rank higher');
    if (at.size === 3) { assert.equal(r.order[0].length, 1); assert.ok(steps < meta.seconds / DT, 'ended early'); }
  }
});

test('two players zapped by the same beam in the same step share a place', () => {
  const g = make(3, 21), [a, b, c] = [...g.bodies.keys()];
  const hold = () => { for (const pid of [a, b]) { const body = g.bodies.get(pid); body.x = 0; body.z = 3; } return {}; };   // same spot (separate leaves exact overlaps alone)
  let steps = 0; while (!g.over && steps++ < 1300) { hold(); tick(g, {}); }
  const r = checkResult(g, 3);
  assert.ok(r.order.some(grp => grp.includes(a) && grp.includes(b)), JSON.stringify(r.order));
});

test('the beams get faster and come more often as the clock runs; harder is faster', () => {
  const p0 = pace(0), p1 = pace(30), p2 = pace(60);
  assert.ok(p0.every > p1.every && p1.every > p2.every);
  assert.ok(p0.sweep < p1.sweep && p1.sweep < p2.sweep && p0.spin < p2.spin);
  assert.ok(pace(30, 'hard').sweep > p1.sweep && pace(30, 'easy').sweep < p1.sweep);
  const g = make(1, 4); const [a] = g.bodies.keys(); let first = null;
  while (!first && !g.over) { tick(g); first = g.state().bm[0]; }
  assert.ok(first, 'a beam came'); assert.equal(first[1], SWEEP, 'the first beams are sweeps');
  assert.ok(Math.abs(first[5]) >= pace(0).sweep * 0.89 && Math.abs(first[5]) <= pace(5).sweep * 1.11);
});

test('state is small and rounded', () => {
  const g = make(4, 2); run(g, 30, {});
  const s = JSON.stringify(g.state());
  assert.ok(s.length < 400, `${s.length} bytes`);
  assert.ok(!/\d\.\d{4,}/.test(s), 'three decimals at most');
});
