import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, goalFor, heartsFor } from '../js/games/cannonball-catch/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs() : inputs)); return ev; };
function checkResult(g, n) {
  const r = g.result();
  assert.ok(r.coop && typeof r.coop.success === 'boolean', 'a co-op result');
  assert.equal(r.order.length, 1, 'one group: the whole team');
  assert.deepEqual([...r.order[0]].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}
/** The team bot: each ball goes to the nearest free player(s) who can still get there; they run to it, and dive at the end. */
function team(g) {
  return () => {
    const st = g.state(), out = {}, taken = new Set(), pids = [...g.bodies.keys()], go = new Map();
    for (const ball of st.bl.slice().sort((a, b) => a[5] - b[5])) {
      const need = ball[7] ? 2 : 1;
      const free = pids.filter(p => !taken.has(p)).map(p => { const b = g.bodies.get(p); return { p, d: Math.hypot(b.x - ball[3], b.z - ball[4]) }; }).filter(f => f.d - 1.3 < meta.move.speed * ball[5]).sort((a, b) => a.d - b.d);
      if (free.length < need) continue;
      for (const f of free.slice(0, need)) { taken.add(f.p); go.set(f.p, ball); }
    }
    for (const p of pids) {
      const b = g.bodies.get(p), ball = go.get(p); if (!ball) continue;
      const dx = ball[3] - b.x, dz = ball[4] - b.z, d = Math.hypot(dx, dz);
      const dive = d > 1.3 && d < 2.6 && ball[5] < 0.4 && d > meta.move.speed * ball[5] - 0.6;
      out[p] = d < 0.25 ? { mx: 0, mz: 0, b: 0 } : { mx: dx / d * Math.min(1, d), mz: dz / d * Math.min(1, d), b: dive ? IN.A : 0 };
    }
    return out;
  };
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody moves, the castle falls early and the result is a co-op loss`, () => {
  const g = make(n, 40 + n);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps < meta.seconds / DT, 'ended before the bell');
  const r = checkResult(g, n), st = g.state();
  assert.equal(r.coop.success, false); assert.equal(st.hp, 0);
  assert.equal(g.init().hearts, heartsFor(n));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that runs to the rings usually saves the castle, inside the clock`, () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = make(n, seed * 7 + n); let steps = 0;
    const bot = team(g);
    while (!g.over && steps < meta.seconds / DT + 5) { tick(g, bot()); steps++; }
    assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
    const r = checkResult(g, n); if (r.coop.success) wins++;
    const total = Object.values(r.scores).reduce((a, b) => a + b, 0);
    assert.ok(total >= g.state().c, 'every catch is credited to someone (big balls credit two)');
  }
  assert.ok(wins >= 3, `${wins}/5 saved`);
});

test('standing in the ring catches it (credited to whoever caught it); a miss costs a heart', () => {
  const g = make(2, 5), [a, b] = [...g.bodies.keys()];
  let ev = [], steps = 0;
  // wait for the first ball, put a on its landing spot, b far away
  while (!g.state().bl.length && steps++ < 200) tick(g);
  const [, , , x, z] = g.state().bl[0];
  const pin = () => { const A = g.bodies.get(a); A.x = x; A.z = z; const B = g.bodies.get(b); B.x = -x || 5; B.z = -z || 4; return {}; };
  while (!ev.some(e => e.e === 'catch' || e.e === 'miss') && steps++ < 200) { pin(); ev = ev.concat(tick(g)); }
  const c = ev.find(e => e.e === 'catch'); assert.ok(c, 'caught'); assert.deepEqual(c.pids, [a]);
  assert.equal(g.result().scores[a], 1); assert.equal(g.result().scores[b], 0);
  assert.ok(g.bodies.get(a).flags & F.CARRY, 'hugging the ball (slowed)');
  const hp = g.state().hp;
  const miss = run(g, 6).find(e => e.e === 'miss'); assert.ok(miss, 'nobody under the next one');
  assert.ok(g.state().hp < hp);
});

test('a dive lunges forward, reaches further, then leaves you down for a moment', () => {
  const g = make(1, 2), [a] = g.bodies.keys(), body = g.bodies.get(a);
  run(g, 0.3, { [a]: { mx: 1, mz: 0, b: 0 } });
  const x0 = body.x; tick(g, { [a]: { mx: 1, mz: 0, b: IN.A } });
  assert.ok(body.flags & F.STUN && body.flags & F.AIR, 'diving');
  run(g, RULES.dive + RULES.diveRest + 0.1);
  assert.ok(body.x - x0 > 1.8, `dove ${(body.x - x0).toFixed(2)} m`);
  assert.equal(body.flags & (F.STUN | F.AIR), 0, 'back up');
  run(g, RULES.diveCool, { [a]: { mx: 1, mz: 0, b: 0 } });
  tick(g, { [a]: { mx: 1, mz: 0, b: IN.A } }); assert.ok(body.flags & F.AIR, 'dives again once cooled down');
  run(g, 0.1, { [a]: { mx: 1, mz: 0, b: IN.A } }); run(g, RULES.dive + RULES.diveRest + 0.1, { [a]: { mx: 1, mz: 0, b: IN.A } });
  assert.equal(body.flags & F.AIR, 0, 'holding the button does not dive again');
});

test('big balls only come with three or more players, and need two catchers', () => {
  for (const n of [1, 2]) { const g = make(n, 9); let big = false; run(g, 60, () => { if (g.state().bl.some(b => b[7])) big = true; return {}; }); assert.equal(big, false); }
  const g = make(3, 4), [a, b, c] = [...g.bodies.keys()];
  let ball = null, steps = 0;
  while (!ball && !g.over && steps++ < 1200) { tick(g, team(g)()); ball = g.state().bl.find(x => x[7]); }
  assert.ok(ball, 'a big ball came');
  const [id, , , x, z] = ball;
  // only a stands under it: flattened, and the castle still loses a heart
  let ev = []; const hp = g.state().hp;
  while (g.state().bl.some(x2 => x2[0] === id) && steps++ < 2000) { const A = g.bodies.get(a); A.x = x; A.z = z; for (const p of [b, c]) { const B = g.bodies.get(p); B.x = 7.5; B.z = p === b ? 5 : -5; } ev = ev.concat(tick(g)); }
  assert.ok(ev.some(e => e.e === 'squash' && e.pid === a), 'flattened');
  assert.ok(g.bodies.get(a).flags & F.STUN);
  assert.ok(g.state().hp <= hp - 1);
  // two under the next big one catch it, and both are credited
  let two = null; steps = 0;
  while (!two && !g.over && steps++ < 1500) {
    const bl = g.state().bl.find(x2 => x2[7]);
    if (bl) for (const [p, off] of [[b, -0.3], [c, 0.3]]) { const B = g.bodies.get(p); B.x = bl[3] + off; B.z = bl[4]; }
    for (const e of tick(g, team(g)())) if (e.e === 'catch' && e.big) two = e;
  }
  assert.ok(two, 'a big catch'); assert.equal(two.pids.length, 2);
});

test('reaching the catch goal ends it early as a win; the clock running out with hearts left is a win', () => {
  assert.ok(goalFor(1) < goalFor(4));
  const g = make(1, 2), [a] = g.bodies.keys();
  // stand under every ball the moment it is fired: every shot is a catch
  run(g, 61, () => { const bl = g.state().bl[0]; if (bl) { const b = g.bodies.get(a); b.x = bl[3]; b.z = bl[4]; } return {}; });
  assert.ok(g.over); const st = g.state();
  assert.equal(st.c, goalFor(1)); assert.ok(st.left > 0, `ended early with ${st.left}s left`);
  assert.equal(checkResult(g, 1).coop.success, true);
});

test('state is small and rounded', () => {
  const g = make(4, 2); run(g, 50, team(g));
  const s = JSON.stringify(g.state());
  assert.ok(s.length < 400, `${s.length} bytes`);
  assert.ok(!/\d\.\d{3,}/.test(s), 'two decimals at most');
});
