import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, match, toBits, CELLS, PINS, CROSSES, MSGS, NEED, LINES, SOLO_ROUNDS } from '../js/games/secret-architect/sim.js';
import { SHAPES, GRID } from '../js/games/secret-architect/shapes.js';

const mk = (n, seed = 4) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty: 'normal' });
const toPhase = (g, ph) => { let n = 0; while (g.state().phase !== ph && !g.over && n++ < 5000) g.step(0.05); };
const shape = (r, pids) => { const all = r.order.flat(); assert.equal(all.length, pids.length); assert.deepEqual([...all].sort(), [...pids].sort()); assert.equal(typeof r.coop.success, 'boolean'); };
/** Copy the blueprint (read from the Architect's private view, or the solo peek) onto a builder's grid. */
const copy = (g, pid, target) => { for (let i = 0; i < CELLS; i++) if (target[i] === '1' && g.priv(pid).grid[i] !== '1') g.act(pid, 'tap', i); };

test('blueprints: 6 x 6, at least 5 blocks, names unique, easy and hard ones', () => {
  assert.equal(GRID, 6);
  for (const s of SHAPES) { assert.equal(s.rows.length, 6); assert.ok(s.rows.every(r => /^[.#]{6}$/.test(r)), s.name); assert.ok(toBits(s.rows).split('1').length - 1 >= 5); }
  assert.equal(new Set(SHAPES.map(s => s.name)).size, SHAPES.length);
  assert.ok(SHAPES.filter(s => s.easy).length >= 6 && SHAPES.filter(s => !s.easy).length >= 6);
});

test('match: both / either, so filling everything is punished', () => {
  const t = toBits(SHAPES[0].rows);
  assert.equal(match(t, t), 100); assert.equal(match(t, '0'.repeat(CELLS)), 0);
  assert.ok(match(t, '1'.repeat(CELLS)) < 50);
});

test('the Architect rotates; marks and messages are limited; only the Architect can send them', () => {
  for (const n of [2, 3, 4]) {
    const g = mk(n, n), archs = [];
    for (let r = 0; r < n; r++) { toPhase(g, 'build'); archs.push(g.state().arch); toPhase(g, 'show'); }
    assert.deepEqual(archs, Array.from({ length: n }, (_, i) => i + 1));
  }
  const g = mk(3); toPhase(g, 'build'); const a = g.state().arch;
  for (let c = 0; c < 10; c++) { g.act(a, 'mark', { c, k: 'p' }); g.act(a, 'mark', { c: c + 20, k: 'x' }); }
  const m = g.state().marks; assert.equal(m.filter(x => x[1] === 'p').length, PINS); assert.equal(m.filter(x => x[1] === 'x').length, CROSSES);
  g.act(2, 'say', 'warm'); assert.equal(g.state().msgs.length, 0, 'a builder cannot speak');
  g.act(a, 'say', 'name'); g.act(a, 'say', 'name'); g.act(a, 'say', 'nope');
  for (let i = 0; i < 10; i++) g.act(a, 'say', 'warm');
  const msgs = g.state().msgs; assert.equal(msgs.length, MSGS); assert.ok(msgs[0].startsWith("It's ")); assert.equal(msgs.filter(x => x.startsWith("It's a") || x.startsWith("It's an")).length, 1);
  g.act(a, 'tap', 3); assert.equal(g.priv(a).grids[a], undefined, 'the Architect has no grid');
});

test('perfect builders: 100 each, the Architect half the average, team win; 2 players tie-break on messages', () => {
  const g = mk(2, 8);
  toPhase(g, 'build'); let a = g.state().arch, b = a === 1 ? 2 : 1;
  g.act(a, 'say', 'warm'); g.act(a, 'say', 'cold');
  copy(g, b, g.priv(a).target); g.act(b, 'done', true);
  toPhase(g, 'show'); assert.equal(g.state().shown.match[b], 100); assert.equal(g.state().scores[a], 50);
  toPhase(g, 'build'); a = g.state().arch; b = a === 1 ? 2 : 1;
  g.act(a, 'say', 'warm');
  copy(g, b, g.priv(a).target);
  while (!g.over) g.step(0.05);
  const r = g.result(); shape(r, [1, 2]);
  assert.equal(r.scores[1], 150); assert.equal(r.scores[2], 150);
  assert.deepEqual(r.order, [[2], [1]], 'player 2 used fewer messages as Architect');
  assert.equal(r.coop.success, true);
});

test('all builders Done ends the build early', () => {
  const g = mk(3); toPhase(g, 'build'); const a = g.state().arch;
  for (const p of [1, 2, 3]) if (p !== a) { g.act(p, 'tap', 0); g.act(p, 'done', true); }
  for (let i = 0; i < 25; i++) g.step(0.05);
  assert.equal(g.state().phase, 'show');
});

test('solo: blueprint shown while peeking, hidden while building, one peek again', () => {
  const g = mk(1, 12);
  assert.ok(g.priv(1).target, 'shown during the peek');
  const t = g.priv(1).target;
  toPhase(g, 'build'); assert.equal(g.priv(1).target, null);
  g.act(1, 'peek'); assert.ok(g.priv(1).target); g.act(1, 'peek');
  for (let i = 0; i < 40; i++) g.step(0.05);
  assert.equal(g.priv(1).target, null); assert.equal(g.priv(1).repeek, 0);
  copy(g, 1, t);
  toPhase(g, 'show'); assert.equal(g.state().shown.match[1], 100);
  while (!g.over) g.step(0.05);
  const r = g.result(); shape(r, [1]);
  assert.equal(g.state().round, SOLO_ROUNDS - 1);
  assert.equal(r.coop.success, false, 'one perfect round out of three is 33%');
});

test('every count ends in time with nobody playing; result shape; lines are all short', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 20 + n); let t = 0;
    while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over, `ends in time for ${n}`);
    const r = g.result(); shape(r, Array.from({ length: n }, (_, i) => i + 1)); assert.equal(r.coop.success, false);
  }
  for (const t of Object.values(LINES)) assert.ok(t.length <= 24, t);
  assert.ok(NEED <= 60);
});
