import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, TILES, tileAt, RULES, ISLAND_R } from '../js/games/meteor-dash/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
/** One server tick: everyone's input, then the step. Returns (and empties) the events. */
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

test('the island: every tile finds itself, the sea finds nothing', () => {
  assert.ok(TILES.length > 70 && TILES.length < 110, `${TILES.length} tiles`);
  TILES.forEach((t, i) => { assert.equal(tileAt(t.x, t.z), i); assert.equal(tileAt(t.x + 0.3, t.z - 0.3), i); });
  assert.equal(tileAt(ISLAND_R + 2, 0), -1); assert.equal(tileAt(0, -20), -1);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): ends by itself inside the clock with a valid result`, () => {
  const g = make(n, 40 + n);
  let steps = 0; while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over, 'ended'); assert.ok(steps <= meta.seconds / DT + 1);
  const r = checkResult(g, n), st = g.state();
  for (const v of Object.values(r.scores)) assert.ok(v >= 0 && v <= meta.seconds);
  assert.ok(st.left >= 0);
});

test('walking off the edge drops you into the lava and out; the last one standing wins early', () => {
  const g = make(2), [a, b] = [...g.bodies.keys()];
  const ev = run(g, 6, () => ({ [a]: { mx: 1, mz: 0, b: 0 } }));
  assert.ok(ev.some(e => e.e === 'fall' && e.pid === a), 'a fell');
  assert.ok(g.over, 'one left: over');
  assert.ok(g.bodies.get(a).y < 0, 'a dropped');
  assert.deepEqual(checkResult(g, 2).order, [[b], [a]]);
});

test('falling in the same step is a tie; falling later ranks higher', () => {
  const g = make(4), [a, b, c, d] = [...g.bodies.keys()];
  tick(g); g.bodies.get(a).x = 30; tick(g);                   // a first
  run(g, 0.5); g.bodies.get(b).x = 30; g.bodies.get(c).x = -30; tick(g);   // b and c together
  assert.equal(g.over, false, 'the fall plays out first'); run(g, 2);
  assert.ok(g.over); assert.deepEqual(checkResult(g, 4).order, [[d], [b, c], [a]]);
});

test('a hop floats you over a hole and you fall when you land', () => {
  const g = make(1), [a] = [...g.bodies.keys()], body = g.bodies.get(a);
  tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(body.flags & F.AIR); assert.ok(body.y > 0);
  body.x = 30; tick(g); assert.equal(g.over, false, 'in the air: no fall');
  run(g, RULES.hop + 0.2);
  assert.ok(g.bodies.get(a).y < 0, 'landed on nothing: falling'); run(g, 2);
  assert.ok(g.over, 'out (solo: the game ends)');
  // holding the button does not hop again; the cooldown blocks a second hop
  const h = make(1), [p] = [...h.bodies.keys()], hb = h.bodies.get(p);
  tick(h, { [p]: { mx: 0, mz: 0, b: IN.A } }); run(h, RULES.hop + 0.1, { [p]: { mx: 0, mz: 0, b: IN.A } });
  assert.equal(hb.flags & F.AIR, 0, 'held button: one hop only');
  tick(h); tick(h, { [p]: { mx: 0, mz: 0, b: IN.A } }); assert.equal(hb.flags & F.AIR, 0, 'cooling down');
});

test('meteors warn first, then knock players back and smash the floor', () => {
  const g = make(2, 9);
  const keys = [...g.bodies.keys()];
  let warned = false, bonk = null, broke = false, boomAt = null, steps = 0;
  while (!g.over && !(bonk && broke) && steps++ < 1200) {
    for (const pid of keys) g.input(pid, null);
    g.step(DT); const ev = g.events.splice(0), st = g.state();
    if (st.m.length) { warned = true; for (const m of st.m) assert.ok(m[3] > 0 && m[3] <= RULES.warn); }
    for (const e of ev) { if (e.e === 'boom') { assert.ok(warned, 'a ring showed before the boom'); boomAt = e; } if (e.e === 'bonk' && !bonk) { const b = g.bodies.get(e.pid); bonk = { flags: b.flags, v: Math.hypot(b.vx, b.vz) }; } }
    if (st.d.some((v, i) => i % 2 === 1 && v === 0)) broke = true;
  }
  assert.ok(boomAt, 'a meteor landed'); assert.ok(broke, 'a tile was smashed');
  assert.ok(bonk, 'someone was caught in a blast'); assert.ok(bonk.flags & F.STUN); assert.ok(bonk.v >= RULES.pushMin * 0.9, `pushed at ${bonk.v}`);
});

test('the edge crumbles inward over time', () => {
  const g = make(2, 4);
  run(g, 40, () => { for (const b of g.bodies.values()) { b.flags |= F.AIR; b.x = 0; b.z = 0; } return {}; });   // nobody can fall: watch the floor
  assert.equal(g.over, false);
  const tiles = g.init().tiles;
  const rim = ISLAND_R + 0.4 - (40 - RULES.crumbleFrom) * RULES.crumbleRate;
  TILES.forEach((t, i) => { if (Math.hypot(t.x, t.z) > rim + 0.8) assert.equal(tiles[i], 0, `tile ${i} at ${Math.hypot(t.x, t.z).toFixed(1)} m is gone`); });
  assert.ok(tiles.some(v => v > 0), 'the middle is still there');
});

test('state is small and rounded', () => {
  const g = make(4, 2); run(g, 20, {});
  const s = JSON.stringify(g.state());
  assert.ok(s.length < 400, `${s.length} bytes`);
  assert.ok(!/\d\.\d{3,}/.test(s), 'two decimals at most');
});
