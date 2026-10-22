import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES } from '../js/games/wobble-tower/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
const pids = g => [...g.bodies.keys()];
function tick(g, inputs = {}) {
  for (const pid of pids(g)) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
/** Wait for this player's next block to start swinging. */
function untilSwing(g, pid, cap = 100) { let ev = []; for (let i = 0; i < cap && g.tower(pid).mode !== 'swing' && !g.over; i++) ev = ev.concat(tick(g)); return ev; }
/** Drop at an exact swing phase (as a phone that saw it would). */
const dropAt = (g, pid, ph) => { const t = g.tower(pid); g.act(pid, 'drop', [t.bid, ph]); return g.events.splice(0); };
/** Let the swing run until it has just passed a point where sin(phase) = s (within the lag window), and return that phase. */
function phaseFor(g, pid, s) {
  const t = g.tower(pid), base = Math.asin(Math.max(-1, Math.min(1, s)));
  for (let i = 0; i < 200; i++) {
    const lo = Math.max(t.ph0, t.ph - t.w * RULES.lag * 0.8);
    for (let k = -2; k < 60; k++) for (const p of [base + 2 * Math.PI * k, Math.PI - base + 2 * Math.PI * k]) if (p <= t.ph && p >= lo) return p;
    tick(g);
  }
  throw new Error('the swing never got there');
}
/** A player with timing error `err` seconds aiming for the middle of the swing. */
function skilled(g, err, seed = 1) {
  const noise = makeRng(seed), aims = new Map();
  return () => {
    for (const pid of pids(g)) {
      const t = g.tower(pid); if (t.mode !== 'swing') continue;
      let a = aims.get(pid);
      if (!a || a.bid !== t.bid) { a = { bid: t.bid, ph: Math.ceil(t.ph / Math.PI + 0.3) * Math.PI + (noise() - 0.5) * 2 * err * t.w }; aims.set(pid, a); }
      if (t.ph >= a.ph) g.act(pid, 'drop', [t.bid, t.ph]);
    }
  };
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), pids(g).sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  for (let i = 1; i < r.order.length; i++) assert.ok(r.scores[r.order[i - 1][0]] > r.scores[r.order[i][0]], 'groups best first');
  for (const grp of r.order) assert.ok(grp.every(p => r.scores[p] === r.scores[grp[0]]), 'a group shares a score');
  return r;
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s): ends by itself at the bell; nobody pressing = everyone 0 and tied`, () => {
  const g = make(n, 20 + n); let steps = 0;
  while (!g.over && steps++ < meta.seconds / DT + 5) tick(g);
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n);
  assert.equal(r.order.length, 1); assert.ok(Object.values(r.scores).every(s => s === 0));
  assert.equal(g.init().towers.length, n);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): good timing builds a tall tower; mashing builds a short one`, () => {
  const g = make(n, 5 + n), good = skilled(g, 0.05, n);
  const masher = makeRng(77);
  const [m] = pids(g);
  while (!g.over) {
    good();
    const t = g.tower(m);
    if (n > 1 && t.mode === 'swing' && masher() < 0.3) g.act(m, 'drop', [t.bid, t.ph]);     // the first player mashes (when not alone)
    tick(g);
  }
  const r = checkResult(g, n);
  for (const pid of pids(g)) if (n === 1 || pid !== m) assert.ok(r.scores[pid] >= 12, `skilled player stacked ${r.scores[pid]}`);
  if (n > 1) { assert.ok(r.scores[m] < Math.min(...pids(g).filter(p => p !== m).map(p => r.scores[p])), 'the masher is last'); assert.ok(r.order[r.order.length - 1].includes(m)); }
});

test('perfect, lean, trim and miss do what they say', () => {
  const g = make(1, 2), [p] = pids(g), t = g.tower(p);
  untilSwing(g, p);
  let ev = dropAt(g, p, phaseFor(g, p, 0));
  const perf = ev.find(e => e.e === 'place'); assert.equal(perf.k, 'perfect'); assert.equal(perf.x, 0); assert.equal(t.stack.length, 1); assert.equal(t.wob, 0);
  // a little off: whole block, offset, wobble goes up
  untilSwing(g, p); const w1 = t.stack[0].w;
  ev = dropAt(g, p, phaseFor(g, p, (0.2 * w1) / RULES.amp));
  const lean = ev.find(e => e.e === 'place'); assert.equal(lean.k, 'lean'); assert.equal(lean.w, w1); assert.ok(Math.abs(lean.x - 0.2 * w1) < 0.02, `x ${lean.x}`); assert.ok(t.wob > 0.1);
  // further off: the overhang past RULES.keep is sliced off
  untilSwing(g, p); const top = t.stack[t.stack.length - 1];
  ev = dropAt(g, p, phaseFor(g, p, -(0.6 * top.w) / RULES.amp));
  const trim = ev.find(e => e.e === 'place'); assert.equal(trim.k, 'trim'); assert.ok(trim.w < top.w - 0.2, 'narrower'); assert.ok(trim.cut && trim.cut[1] > 0.2);
  assert.ok(Math.abs(trim.w - (top.w - (0.6 - RULES.keep) * top.w)) < 0.02);
  // nowhere near: a miss, nothing added
  untilSwing(g, p); const h = t.stack.length, ph = phaseFor(g, p, 1), w0 = t.wob;
  ev = dropAt(g, p, ph);
  assert.ok(ev.some(e => e.e === 'miss')); assert.equal(t.stack.length, h); assert.ok(t.wob > w0);
});

test('too much wobble topples the top third, and building goes on', () => {
  const g = make(1, 4), [p] = pids(g), t = g.tower(p);
  let topple = null;
  for (let k = 0; k < 40 && !topple && !g.over; k++) {
    untilSwing(g, p);
    const ev = dropAt(g, p, phaseFor(g, p, ((k % 2 ? 1 : -1) * 0.28 * (t.stack[t.stack.length - 1] || { w: RULES.W0 }).w) / RULES.amp));   // always leaning
    topple = ev.find(e => e.e === 'topple');
    if (topple) { assert.equal(topple.k, Math.max(RULES.toppleMin, Math.ceil((topple.h + topple.k) * RULES.toppleFrac))); }
  }
  assert.ok(topple, 'it toppled');
  assert.equal(t.stack.length, topple.h); assert.equal(t.wob, RULES.toppleWob);
  untilSwing(g, p); assert.equal(t.mode, 'swing', 'and a new block comes');
});

test('lag: a press is judged at the phase the phone saw, if it is recent; a stale or future claim is clamped', () => {
  const g = make(1, 9), [p] = pids(g), t = g.tower(p);
  untilSwing(g, p); for (let i = 0; i < 8; i++) tick(g);
  const seen = t.ph - t.w * 0.2;                         // what the phone showed 0.2 s ago
  const ev = dropAt(g, p, seen); const pl = ev.find(e => e.e === 'place' || e.e === 'miss');
  assert.ok(Math.abs((pl.from ?? pl.x) - RULES.amp * Math.sin(seen)) < 0.02, 'judged where it was seen');
  untilSwing(g, p); for (let i = 0; i < 30; i++) tick(g);
  const topX = t.stack.length ? t.stack[t.stack.length - 1].x : 0, lim = t.ph + t.w * RULES.ahead, old = t.ph - t.w * RULES.lag;
  const ev2 = dropAt(g, p, t.ph + 50); const p2 = ev2.find(e => e.e === 'place' || e.e === 'miss');
  assert.ok(Math.abs((p2.from ?? p2.x) - (topX + RULES.amp * Math.sin(lim))) < 0.02, 'a claim from the future is clamped to just ahead');
  untilSwing(g, p); for (let i = 0; i < 30; i++) tick(g);
  const topX3 = t.stack.length ? t.stack[t.stack.length - 1].x : 0, old3 = t.ph - t.w * RULES.lag;
  const ev3 = dropAt(g, p, t.ph - 100); const p3 = ev3.find(e => e.e === 'place' || e.e === 'miss');
  assert.ok(Math.abs((p3.from ?? p3.x) - (topX3 + RULES.amp * Math.sin(old3))) < 0.02 || p3.e === 'miss', 'a stale claim is clamped to the lag window');
  void old;
  // wrong block id / junk is ignored
  untilSwing(g, p); const h = t.stack.length;
  g.act(p, 'drop', [t.bid + 5, t.ph]); g.act(p, 'drop', 'x'); g.act(p, 'drop', [t.bid, NaN]); g.act(p, 'nope', 1);
  assert.equal(t.stack.length, h); assert.equal(t.mode, 'swing');
});

test('an A press on the input stream drops too (keyboard / gamepad with no view)', () => {
  const g = make(2, 6), [a, b] = pids(g);
  untilSwing(g, a); untilSwing(g, b);
  const ev = [...tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } }), ...tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } }), ...tick(g), ...tick(g)];
  assert.equal(ev.filter(e => (e.e === 'place' || e.e === 'miss') && e.pid === a).length, 1, 'one drop per press, holding does not repeat');
  assert.ok(!ev.some(e => e.pid === b && (e.e === 'place' || e.e === 'miss')));
  assert.ok(g.bodies.get(a).flags & F.FROZEN, 'characters stand on their lifts');
});

test('the lift rises with the tower; state is small', () => {
  const g = make(4, 3), go = skilled(g, 0.04, 3);
  for (let i = 0; i < 300; i++) { go(); tick(g); }
  for (const pid of pids(g)) assert.equal(g.bodies.get(pid).y, Math.round(g.tower(pid).stack.length * RULES.BH * 100) / 100);
  const s = JSON.stringify(g.state()); assert.ok(s.length < 400, `${s.length} bytes`);
});
