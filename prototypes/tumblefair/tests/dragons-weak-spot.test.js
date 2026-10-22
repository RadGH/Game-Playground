import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, padAt, heartsFor, sweepAngle, angleOf, holderOf } from '../js/games/dragons-weak-spot/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
function checkResult(g, n) {
  const r = g.result();
  assert.ok(r.coop && typeof r.coop.success === 'boolean');
  assert.equal(r.order.length, 1);
  assert.deepEqual([...r.order[0]].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}
/** What the team knows when everyone calls out their steps: the union of every phone's private steps. */
function teamKnows(g) { const known = {}; for (const pid of g.bodies.keys()) for (const [i, s] of g.priv(pid).pat || []) known[i] = s; return known; }
/** A team bot: during a window the nearest player runs to the next scale's pad and strikes; the others stay clear.
 *  Out of rings that are about to land, and hops when the sweep is about to reach it. */
function team(g, { hops = true, dodge = true } = {}) {
  let tick = 0;
  return () => {
    tick++;
    const st = g.state(), out = {}, pids = [...g.bodies.keys()], known = teamKnows(g);
    const target = st.ph === 'window' && known[st.st] != null ? padAt(known[st.st]) : null;
    const striker = target ? pids.slice().sort((a, b) => { const A = g.bodies.get(a), B = g.bodies.get(b); return Math.hypot(A.x - target.x, A.z - target.z) - Math.hypot(B.x - target.x, B.z - target.z); })[0] : null;
    pids.forEach((p, k) => {
      const b = g.bodies.get(p); let gx = (k - (pids.length - 1) / 2) * 2.6, gz = 2.5, press = 0;
      if (p === striker) { gx = target.x; gz = target.z + 0.6; if (Math.hypot(b.x - target.x, b.z - target.z) < 1.1 && tick % 2) press |= IN.A; }
      if (dodge) for (const r of st.rg) if (r[3] < 1.0 && Math.hypot(b.x - r[1], b.z - r[2]) < RULES.ringR + 0.7) { const dx = b.x - r[1], dz = b.z - r[2], d = Math.hypot(dx, dz) || 1; gx = b.x + dx / d * 3; gz = b.z + dz / d * 3; }
      if (hops && st.sw) { const [, dir, t] = st.sw, a = angleOf(b.x, b.z), now = sweepAngle(dir, Math.max(0, t)), soon = sweepAngle(dir, t + 0.2); if (t > -0.2 && (a - now) * dir >= -0.05 && (a - soon) * dir <= 0.05) press |= IN.B; }
      const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
      out[p] = { mx: d < 0.2 ? 0 : dx / d * Math.min(1, d), mz: d < 0.2 ? 0 : dz / d * Math.min(1, d), b: press };
    });
    return out;
  };
}
/** Play safely (dodging, no strikes yet) until the first window opens. */
function toWindow(g) { const bot = team(g); let k = 0; while (g.state().ph !== 'window') { assert.ok(k++ < 1000 && !g.over, 'a window opens'); const inp = bot(); for (const p in inp) inp[p].b &= ~IN.A; tick(g, inp); } }
const play = (g, bot) => { let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g, bot ? bot() : {}); steps++; } return steps; };

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody does anything — the dragon wins, inside the clock`, () => {
  const g = make(n, 40 + n), steps = play(g);
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n); assert.equal(r.coop.success, false);
  assert.ok(Object.values(r.scores).every(s => s === 0));
  assert.equal(g.init().hearts, heartsFor(n));
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that shares the order, dodges and hops usually beats it`, () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = make(n, seed * 11 + n), steps = play(g, team(g));
    assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
    const r = checkResult(g, n); if (r.coop.success) wins++;
    if (r.coop.success) { assert.equal(g.state().hp, 0); assert.ok(steps < meta.seconds / DT, 'won before the bell'); assert.equal(Object.values(r.scores).reduce((a, b) => a + b, 0), g.init().hpMax, 'all damage credited'); }
  }
  assert.ok(wins >= 4, `${wins}/5 won`);
});

test('without hopping the sweeps burn the team down: it usually loses', () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4]) { const g = make(2, seed); play(g, team(g, { hops: false, dodge: false })); if (g.result().coop.success) wins++; }
  assert.ok(wins <= 1, `${wins}/4`);
});

test('the order is private: each step is on exactly one phone, the public state never names a scale', () => {
  for (const n of [2, 3, 4]) {
    const g = make(n, 9);
    toWindow(g);
    const seen = {};
    for (const pid of g.bodies.keys()) for (const [i] of g.priv(pid).pat) seen[i] = (seen[i] || 0) + 1;
    const len = g.state().len; assert.equal(Object.keys(seen).length, len); assert.ok(Object.values(seen).every(c => c === 1));
    const st = JSON.stringify(g.state()); assert.ok(!/pat|order/.test(st));
  }
  // holders rotate between windows
  assert.notEqual(holderOf(0, 0, 4), holderOf(0, 1, 4));
});

test('solo: the phone shows only the step the player is on, and it follows the hits', () => {
  const g = make(1, 5), pid = 10;
  toWindow(g);
  let pv = g.priv(pid); assert.equal(pv.pat.length, 1); assert.equal(pv.pat[0][0], 0);
  const b = g.bodies.get(pid), p = padAt(pv.pat[0][1]); b.x = p.x; b.z = p.z;
  const ev = tick(g, { [pid]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'hit' && e.dmg === RULES.stepDmg));
  pv = g.priv(pid); assert.equal(pv.pat[0][0], 1);
});

test('the wrong scale: no damage, knocked back, the window loses time; strikes outside a window just clang', () => {
  const g = make(2, 6), [a] = [...g.bodies.keys()];
  let ev = []; while (!ev.some(e => e.e === 'attack')) ev = tick(g);
  const b = g.bodies.get(a); b.x = padAt(0).x; b.z = padAt(0).z;
  ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } }); assert.ok(ev.some(e => e.e === 'clang'));
  toWindow(g);
  const want = teamKnows(g)[0], wrong = (want + 1) % 4, hp = g.state().hp, wl = g.state().wl;
  b.x = padAt(wrong).x; b.z = padAt(wrong).z; b.flags &= ~F.STUN;
  for (let i = 0; i < 12; i++) tick(g);           // let the strike cooldown pass
  b.x = padAt(wrong).x; b.z = padAt(wrong).z;
  ev = tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'wrong')); assert.equal(g.state().hp, hp);
  assert.ok(g.state().wl < wl - 12 * DT - RULES.wrongCost + 0.11);
  assert.ok(g.bodies.get(a).flags & F.STUN);
});

test('the sweep burns a grounded player and misses one in the air', () => {
  for (const airborne of [false, true]) {
    const g = make(1, 8), pid = 10, b = g.bodies.get(pid);
    let ev = []; let guard = 0;
    const safe = team(g); while (!g.state().sw && guard++ < 2000) ev = tick(g, safe());
    assert.ok(g.state().sw, 'a sweep comes');
    const hearts = g.state().hearts; let hurt = false;
    b.x = 0; b.z = 0;
    while (g.state().sw && !g.over) {
      const [, dir, t] = g.state().sw, a = angleOf(b.x, b.z), soon = sweepAngle(dir, t + 0.25);
      const press = airborne && t > 0 && (a - soon) * dir <= 0.05 ? IN.B : 0;
      b.x = 0; b.z = 0; ev = tick(g, { [pid]: { mx: 0, mz: 0, b: press } });
      if (ev.some(e => e.e === 'hurt')) hurt = true;
    }
    assert.equal(hurt, !airborne, airborne ? 'hopped over it' : 'burnt');
    if (!airborne) assert.equal(g.state().hearts, hearts - 1);
  }
});

test('a ring burns whoever stands in it when it lands', () => {
  const g = make(1, 12), pid = 10, b = g.bodies.get(pid);
  let guard = 0; while (!g.state().rg.length && guard++ < 2000) tick(g);
  const [, x, z] = g.state().rg[0], hearts = g.state().hearts; let hurt = false;
  while (!g.over && g.state().rg.some(r => r[1] === x && r[2] === z)) { b.x = x; b.z = z; if (tick(g).some(e => e.e === 'hurt')) hurt = true; }
  assert.ok(hurt); assert.ok(g.state().hearts < hearts);
});

test('same seed, same inputs, same fight', () => {
  const a = make(3, 77), b = make(3, 77), ba = team(a), bb = team(b);
  for (let i = 0; i < 600; i++) { tick(a, ba()); tick(b, bb()); }
  assert.deepEqual(a.state(), b.state());
});
