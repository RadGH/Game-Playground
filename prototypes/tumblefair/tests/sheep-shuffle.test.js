import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { DT, F } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, pensFor, penAt } from '../js/games/sheep-shuffle/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 30 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) { for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 }); g.step(DT); return g.events.splice(0); }
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort()); assert.equal(r.unit, meta.unit);
  for (const grp of r.order) for (const pid of grp) assert.equal(r.scores[pid], r.scores[grp[0]], 'a group shares a score');
  return r;
}
/** A simple herder: pick a free sheep near your own gate, get behind it (as seen from the gate) and walk it in. */
function herd(g) {
  const pens = g.init().pens, out = {};
  for (const [pid, b] of g.bodies) {
    const p = pens.find(x => x.pid === pid); let best = null, bd = 99;
    for (const s of g._sheep) if (s.pen < 0) { const d = Math.hypot(s.x - p.gx, s.z - p.gz) + 0.5 * Math.hypot(s.x - b.x, s.z - b.z); if (d < bd) { bd = d; best = s; } }
    let mx = 0, mz = 0;
    if (best) { const dx = p.gx - best.x, dz = p.gz - best.z, dl = Math.hypot(dx, dz) || 1; mx = best.x - dx / dl * 1.6 - b.x; mz = best.z - dz / dl * 1.6 - b.z; const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m; }
    out[pid] = { mx, mz, b: 0 };
  }
  return out;
}

for (const n of [1, 2, 3, 4]) test(`${n} player(s) standing still: the clock ends it, nobody scores, everyone ties`, () => {
  const g = make(n, 10 + n); let steps = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n);
  assert.equal(r.order.length, 1); for (const v of Object.values(r.scores)) assert.equal(v, 0, 'sheep do not walk into a pen by themselves');
  for (const s of g._sheep) { assert.ok(Number.isFinite(s.x) && Math.abs(s.x) <= meta.arena.hw && Math.abs(s.z) <= meta.arena.hd, 'every sheep stays in the meadow'); }
});

for (const n of [1, 2, 4]) test(`${n} herding bot(s) pen sheep; the score is what is in each pen`, () => {
  const g = make(n, 4); run(g, meta.seconds + 1, () => herd(g));
  assert.ok(g.over);
  const r = checkResult(g, n), st = g.state();
  assert.ok(Object.values(r.scores).every(v => v >= 3), `bots penned some sheep (${JSON.stringify(r.scores)})`);
  const pens = g.init().pens;
  for (const p of pens) { const want = g._sheep.filter(s => s.pen === pens.indexOf(p)).reduce((t, s) => t + (s.gold ? 3 : 1), 0); assert.equal(st.sc[p.pid], want); assert.equal(r.scores[p.pid], want); }
});

test('pens: one per player in a corner, gaps face the middle, fences are walls you cannot walk through', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = make(n), init = g.init();
    assert.equal(init.pens.length, n); assert.equal(init.arena.segs.length, n * 2);
    assert.deepEqual(init.pens.map(p => p.pid).sort(), [...g.bodies.keys()].sort());
    for (const p of init.pens) assert.ok(Math.hypot(p.gx, p.gz) < Math.hypot(p.sx * meta.arena.hw, p.sz * meta.arena.hd), 'the gap is on the inner side');
  }
  // walk straight at the fence from outside: you stop at it
  const g = make(4), [a] = [...g.bodies.keys()], A = g.bodies.get(a), p = g.init().pens[0];
  A.x = p.sx * (meta.arena.hw - RULES.P) - p.sx * 1.5; A.z = p.sz * (meta.arena.hd - 0.6); A.vx = A.vz = 0;
  run(g, 1.5, { [a]: { mx: p.sx, mz: 0, b: 0 } });
  assert.ok(p.sx * A.x < meta.arena.hw - RULES.P, `stopped by the fence (x ${A.x})`);
});

test('a sheep pushed into a pen counts (+1 event); golden counts 3; pushing it back out takes it away', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()], pens = g.init().pens, p = pens.find(x => x.pid === a), i = pens.indexOf(p);
  const s = g._sheep[0], deep = { x: (p.sx > 0 ? p.x1 : p.x0) - p.sx * 1.2, z: (p.sz > 0 ? p.z1 : p.z0) - p.sz * 1.2 };
  s.x = deep.x; s.z = deep.z; s.gold = true;
  const ev = run(g, 0.1);
  assert.ok(ev.some(e => e.e === 'pen' && e.pid === a && e.v === 3));
  assert.equal(s.pen, i); assert.equal(g.state().sc[a], 3); assert.equal(g.state().sc[b], 0);
  run(g, 3); assert.equal(s.pen, i, 'a penned sheep stays put');
  // a rival walks in behind it and BAAs toward the gap
  const B = g.bodies.get(b); B.x = (p.sx > 0 ? p.x1 : p.x0) - p.sx * 0.5; B.z = (p.sz > 0 ? p.z1 : p.z0) - p.sz * 0.5; s.x = deep.x; s.z = deep.z;
  B.yaw = Math.atan2(p.gx - B.x, p.gz - B.z);
  const ev2 = run(g, 2.5, k => ({ [b]: { mx: 0, mz: 0, b: k % 20 === 0 ? IN.A : 0 } }));
  assert.ok(ev2.some(e => e.e === 'baa' && e.pid === b));
  assert.ok(ev2.some(e => e.e === 'out' && e.pid === a), 'BAA drove it out of the pen');
  assert.equal(s.pen, -1);
});

test('BAA has a cooldown and scares sheep in front, not behind', () => {
  const g = make(1), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  A.x = 0; A.z = 0; A.yaw = Math.PI / 2;            // facing +x
  const [front, back] = g._sheep; front.x = 2.5; front.z = 0; back.x = -2.5; back.z = 0; front.pen = back.pen = -1;
  const ev = run(g, 0.5, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.equal(ev.filter(e => e.e === 'baa').length, 1, 'holding the button shouts once');
  assert.ok(front.scare > 0 || front.x > 3.5, 'the sheep in front bolted'); assert.ok(!(back.scare > 0), 'the one behind did not');
});

test('the meadow restocks and a golden sheep turns up; the state stays small', () => {
  const g = make(3, 8);
  run(g, 20, () => herd(g));
  assert.ok(g._sheep.some(s => s.gold), 'a golden sheep');
  assert.ok(g._sheep.filter(s => s.pen < 0).length >= 3, 'still sheep to chase');
  assert.ok(JSON.stringify(g.state()).length < 1600);
  assert.ok(pensFor(4).every((p, i) => penAt(pensFor(4), (p.x0 + p.x1) / 2 + p.sx * 0.5, (p.z0 + p.z1) / 2 + p.sz * 0.5) === i));
});

test('same seed, same inputs: the same match', () => {
  const a = make(3, 21), b = make(3, 21);
  run(a, 15, () => herd(a)); run(b, 15, () => herd(b));
  assert.deepEqual(a.state(), b.state());
});
