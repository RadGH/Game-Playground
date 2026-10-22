import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT, BODY_R, stepBody } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, makeTrack, RULES, TRACKS } from '../js/games/wobblewheel-rally/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 30 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
/** Steer at the centre line a few samples ahead (what a decent player does). */
const driver = (g, pid, b = 0, lat = 0) => { const r = g.racers.get(pid), body = g.bodies.get(pid), [x, z] = g.track.at(r.k + 4, lat); const mx = x - body.x, mz = z - body.z, m = Math.hypot(mx, mz) || 1; return { mx: mx / m, mz: mz / m, b }; };
const allDrive = (g, b = () => 0) => i => Object.fromEntries([...g.bodies.keys()].map(pid => [pid, driver(g, pid, b(i, pid))]));
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}
const skipCountdown = g => run(g, RULES.countdown + 0.05);
/** Move a racer somewhere on the track by hand (and tell its lap tracker where it is now). */
function put(g, id, x, z) { const r = g.racers.get(id), { cx, cz, N } = g.track.loop; let k = 0, d = 1e9; for (let i = 0; i < N; i++) { const e = Math.hypot(cx[i] - x, cz[i] - z); if (e < d) { d = e; k = i; } } r.b.x = x; r.b.z = z; r.b.vx = r.b.vz = 0; r.k = k; }

test('all 16 track variants: corridors never overlap, walls sit W from the centre line, laps in range', () => {
  const seen = new Set();
  for (let v = 0; v < 16; v++) {
    const t = makeTrack(v), { cx, cz, N, L } = t.loop; seen.add(t.id);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      let d = Math.abs(i - j); d = Math.min(d, N - d); if (d * L / N < 9) continue;
      assert.ok(Math.hypot(cx[i] - cx[j], cz[i] - cz[j]) >= 2 * RULES.W + 0.5, `variant ${v}: samples ${i} and ${j} too close`);
    }
    for (const s of t.segs) { let m = 99; for (let k = 0; k < N; k++) m = Math.min(m, Math.hypot(s.ax - cx[k], s.az - cz[k])); assert.ok(Math.abs(m - RULES.W) < 0.1, `variant ${v}: wall point ${m} from the centre`); }
    assert.ok(t.laps >= RULES.minLaps && t.laps <= RULES.maxLaps);
    for (const s of t.segs) assert.ok(Math.abs(s.ax) <= t.hw && Math.abs(s.az) <= t.hd, 'the arena box holds the track');
    assert.equal(t.pads.length, 2); assert.equal(t.muds.length, 2); assert.equal(t.boxes.length, 6);
  }
  assert.equal(seen.size, TRACKS.length);
});

test('the arena goes out in init() with the walls, and the phone\'s prediction (stepBody alone) stays on the track', () => {
  const g = make(1, 5), init = g.init(), pid = 30, b = g.bodies.get(pid);
  assert.ok(init.arena.segs.length > 60); assert.equal(init.track.laps, g.track.laps); assert.equal(init.arena.wall, true);
  skipCountdown(g);
  // a ghost copy driven only by stepBody with the init arena: drive straight at the wall and never get through
  const ghost = { ...b };
  for (let i = 0; i < 80; i++) stepBody(ghost, { mx: 0, mz: -1, b: 0 }, meta.move, init.arena);
  const r = g.racers.get(pid); let best = 99; for (let k = 0; k < g.track.loop.N; k++) best = Math.min(best, Math.hypot(ghost.x - g.track.loop.cx[k], ghost.z - g.track.loop.cz[k]));
  assert.ok(best <= RULES.W - BODY_R + 0.15, `ghost ${best} m from the centre line`); assert.ok(r);
  JSON.stringify(init).length < 12000 || assert.fail('init too big');
});

test('nobody moves during the 3-2-1, then GO', () => {
  const g = make(2), ev = run(g, 2.5, allDrive(g));
  for (const b of g.bodies.values()) { assert.ok(b.flags & F.FROZEN); }
  const p0 = [...g.bodies.values()].map(b => [b.x, b.z]);
  assert.deepEqual([...g.bodies.values()].map(b => [b.x, b.z]), p0);
  assert.ok(ev.filter(e => e.e === 'count').length >= 2);
  const ev2 = run(g, 1, allDrive(g));
  assert.ok(ev2.some(e => e.e === 'go'));
  for (const b of g.bodies.values()) assert.equal(b.flags & F.FROZEN, 0);
  assert.ok(g.state().cd === undefined);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s) driving well: the race finishes before the clock, placings by finish`, () => {
  const g = make(n, 10 + n), ev = []; let steps = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { ev.push(...tick(g, allDrive(g)(steps))); steps++; }
  assert.ok(g.over); assert.ok(steps * DT < meta.seconds - 5, `took ${steps * DT} s`);
  const fins = ev.filter(e => e.e === 'fin' && e.id >= 0);
  assert.equal(fins.length, n, 'every player crossed the line');
  const r = checkResult(g, n);
  assert.deepEqual(r.order.flat(), fins.map(e => e.id), 'order = finish order');
  for (const v of Object.values(r.scores)) assert.equal(v, g.track.laps);
  const laps = ev.filter(e => e.e === 'lap' && e.id === 30).map(e => e.lap);
  assert.deepEqual(laps, Array.from({ length: g.track.laps - 1 }, (_, i) => i + 2), 'one lap call per lap');
  if (n === 1) assert.equal(g.racers.size, 3, 'solo: two CPU karts');
});

for (const n of [1, 2, 4]) test(`${n} player(s) sitting still: the clock ends it at ${meta.seconds} s, a valid order`, () => {
  const g = make(n, 2); let steps = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over);
  if (n === 1) assert.ok(steps * DT < meta.seconds, 'solo: a CPU finishing starts the finish window'); else assert.ok(Math.abs(steps * DT - meta.seconds) < 0.2);
  const r = checkResult(g, n);
  for (const v of Object.values(r.scores)) assert.equal(v, 0);
  if (n === 4) assert.equal(r.order.length, 2, 'two grid rows = two places');
});

test('the first finish starts the finish window; the rest have that long', () => {
  const g = make(2, 4); const [a, b] = [...g.bodies.keys()];
  let steps = 0, firstFin = -1;
  while (!g.over && steps < meta.seconds / DT + 5) {
    const ev = tick(g, { [a]: driver(g, a), [b]: { mx: 0, mz: 0, b: 0 } }); steps++;
    if (firstFin < 0 && ev.some(e => e.e === 'fin' && e.id === a)) firstFin = steps;
  }
  assert.ok(firstFin > 0);
  const waited = (steps - firstFin) * DT;
  assert.ok(Math.abs(waited - RULES.finishWindow - RULES.endPause) < 0.2, `ended ${waited} s after the first finish`);
  const r = checkResult(g, 2); assert.deepEqual(r.order, [[a], [b]]);
});

test('no cutting: a kart moved across the infield is not given the laps, and driving backwards over the line counts nothing', () => {
  const g = make(1, 7), pid = 30, B = g.bodies.get(pid), r = g.racers.get(pid);
  skipCountdown(g);
  run(g, 1.5, i => ({ [pid]: driver(g, pid) }));
  const before = r.prog, N = g.track.loop.N;
  const [x, z] = g.track.at(r.k + Math.floor(N / 2), 0); B.x = x; B.z = z; B.vx = B.vz = 0;     // halfway round, in one step
  tick(g);
  assert.ok(Math.abs(r.prog - before) <= 7, `progress jumped ${r.prog - before}`);
  // backwards: aim at a sample behind
  const g2 = make(1, 7), p2 = 30, r2 = g2.racers.get(p2), B2 = g2.bodies.get(p2);
  skipCountdown(g2);
  run(g2, 6, () => { const [x2, z2] = g2.track.at(r2.k - 4, 0); const mx = x2 - B2.x, mz = z2 - B2.z, m = Math.hypot(mx, mz) || 1; return { [p2]: { mx: mx / m, mz: mz / m, b: 0 } }; });
  assert.ok(r2.prog < 0, `went backwards (${r2.prog})`); assert.equal(g2.state().rs[p2][0], 1, 'still on lap 1');
  assert.equal(g2.lapsOf(p2), 0);
});

test('items: a box gives one and comes back; Zoom Jar boosts; Slick spins whoever drives over it; a hop clears it', () => {
  const g = make(2, 9), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), Ra = g.racers.get(a), Rb = g.racers.get(b);
  skipCountdown(g);
  assert.equal(Ra.item, 1, 'everyone starts with a Zoom Jar');
  let ev = run(g, 0.1, { [a]: { mx: Math.sin(A.yaw), mz: Math.cos(A.yaw), b: IN.A } });
  assert.ok(ev.some(e => e.e === 'use' && e.id === a && e.it === 1)); assert.ok(A.flags & F.BOOST); assert.equal(Ra.item, 0);
  assert.ok(Math.hypot(A.vx, A.vz) > meta.move.speed * 1.2, 'faster than flat out');
  // drive into a box
  const box = g.track.boxes[0]; put(g, a, box.x, box.z);
  ev = tick(g);
  const got = ev.find(e => e.e === 'item' && e.id === a); assert.ok(got && got.it >= 1 && got.it <= 3);
  assert.equal(g.state().bx[0], '0', 'the box is gone');
  run(g, RULES.boxEvery + 0.1); assert.equal(g.state().bx[0], '1', 'and back');
  // a slick dropped in front of b spins b out
  Ra.item = 2; A.x = Rb.b.x + Math.sin(Rb.b.yaw) * 2.5; A.z = Rb.b.z + Math.cos(Rb.b.yaw) * 2.5; A.yaw = Rb.b.yaw + Math.PI; A.vx = A.vz = 0;
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.equal(g.state().sl.length, 1);
  const sl = g.state().sl[0]; Rb.b.x = sl[1]; Rb.b.z = sl[2];
  ev = tick(g);
  assert.ok(ev.some(e => e.e === 'spin' && e.id === b && e.by === a)); assert.ok(Rb.b.flags & F.STUN);
  assert.equal(g.state().sl.length, 0, 'used up');
  // a hopping kart sails over one
  run(g, 1);
  Ra.item = 2; tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } }); const s2 = g.state().sl[0];
  tick(g, { [b]: { mx: 0, mz: 0, b: IN.B } }); assert.ok(Rb.b.flags & F.AIR);
  Rb.b.x = s2[1]; Rb.b.z = s2[2]; ev = tick(g);
  assert.ok(!ev.some(e => e.e === 'spin' && e.id === b), 'jumped it'); assert.equal(g.state().sl.length, 1);
});

test('a Bonk Ball rolls ahead and spins out the kart it hits', () => {
  const g = make(2, 12), [a, b] = [...g.bodies.keys()], Ra = g.racers.get(a), Rb = g.racers.get(b);
  skipCountdown(g);
  const N = g.track.loop.N, [x, z] = g.track.at(Ra.k + 5, 0); Rb.b.x = x; Rb.b.z = z; Rb.k = (Ra.k + 5) % N; Rb.b.vx = Rb.b.vz = 0;
  const [x0, z0] = g.track.at(Ra.k, 0); Ra.b.x = x0; Ra.b.z = z0; Ra.b.yaw = Math.atan2(x - x0, z - z0); Ra.b.vx = Ra.b.vz = 0;
  Ra.item = 3;
  const ev = run(g, 1.5, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'use' && e.it === 3));
  assert.ok(ev.some(e => e.e === 'spin' && e.id === b && e.by === a), JSON.stringify(ev.filter(e => e.e !== 'count')));
});

test('arrow pads boost, mud slows; landing a hop next to a kart bumps it', () => {
  const g = make(2, 14), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), Ra = g.racers.get(a);
  skipCountdown(g);
  const pad = g.track.pads[0]; A.x = pad.x; A.z = pad.z; Ra.k = pad.k; let ev = tick(g);
  assert.ok(ev.some(e => e.e === 'pad' && e.id === a)); assert.ok(A.flags & F.BOOST);
  run(g, 1.2);
  const mud = g.track.muds[0]; A.x = mud.x; A.z = mud.z; Ra.k = mud.k; A.vx = A.vz = 0; tick(g);
  assert.ok(A.flags & F.SLOW);
  const Bb = g.bodies.get(b); run(g, 1);
  A.x = Bb.x + 0.9; A.z = Bb.z; Ra.k = g.racers.get(b).k; A.vx = A.vz = 0; Bb.vx = Bb.vz = 0;
  ev = run(g, RULES.hopTime + 0.15, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.B : 0 } }));
  assert.ok(ev.some(e => e.e === 'hop' && e.id === a));
  assert.ok(ev.some(e => e.e === 'bump' && e.id === b && e.by === a), JSON.stringify(ev));
  assert.equal(A.y, 0); assert.equal(A.flags & F.AIR, 0);
});

test('solo: CPU karts race too (and a harder CPU is faster); the race ends when you finish', () => {
  const times = {};
  for (const d of ['easy', 'hard']) {
    const g = make(1, 21, d); let steps = 0, cpuFin = null;
    while (!g.over && steps < meta.seconds / DT + 5) { const ev = tick(g); steps++; for (const e of ev) if (e.e === 'fin' && e.id < 0 && cpuFin == null) cpuFin = steps * DT; }
    assert.ok(cpuFin != null, `${d}: a CPU finished`); times[d] = cpuFin;
    assert.equal(g.result().order.flat().length, 1);
  }
  assert.ok(times.hard < times.easy, JSON.stringify(times));
  const g = make(1, 22); let steps = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { tick(g, allDrive(g)(steps)); steps++; }
  assert.ok(steps * DT < 70);
});

test('state is small and rounded; same seed, same race', () => {
  const g = make(4, 2); run(g, 10, allDrive(g, i => (i % 30 === 0 ? IN.A : 0)));
  const s = JSON.stringify(g.state()); assert.ok(s.length < 500, `${s.length} bytes`); assert.ok(!/\d\.\d{3,}/.test(s));
  const sim = () => { const h = make(3, 33); run(h, 30, allDrive(h, i => (i % 25 === 0 ? IN.A : i % 40 === 0 ? IN.B : 0))); return JSON.stringify([h.state(), [...h.bodies.values()]]); };
  assert.equal(sim(), sim());
});
