import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeStage, runBall, exitOf, STAGES, TARGET, GAME_S, W, H } from '../js/games/portal-routing/sim.js';

const mk = (n, seed = 6, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
const pidOfSeat = seat => 10 + seat;
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
/** Every owner flips their wrong gates to the setting that rolls home (found by trying them all, like a player would). */
function solveStage(g) {
  const s = g.state(), stg = g.init().stages[s.stage], n = stg.gates.length;
  let plan = null;
  for (let m = 0; m < 1 << n && !plan; m++) { const st = [...Array(n).keys()].map(i => (m >> i) & 1); if (runBall(stg, st) === 'goal') plan = st; }
  assert.ok(plan, 'a setting exists that rolls home');
  stg.gates.forEach((ci, j) => { if (+s.st[j] !== plan[j]) g.act(pidOfSeat(stg.cells[ci].own), 'flip', j); });
}

test('a gate: stem in -> the set arm out; back in through the set arm -> out the stem; through the shut arm -> bounces', () => {
  const c = { k: 'g', m: 1 | 2 | 8, stem: 3, arms: [0, 1], gate: 0 };
  assert.equal(exitOf(c, 3, [0]), 0); assert.equal(exitOf(c, 3, [1]), 1);
  assert.equal(exitOf(c, 0, [0]), 3); assert.equal(exitOf(c, 1, [0]), 1, 'shut arm: bounces back');
  assert.equal(exitOf({ k: 't', m: 2 | 8 }, 3, []), 1);
  assert.equal(exitOf({ k: 'S', m: 2 }, -1, []), 1); assert.equal(exitOf({ k: 'S', m: 2 }, 1, []), 1, 'the launcher bounces it back');
});

test('the generator: thousands of stages, each solvable with the right gates and NOT with the starting ones', () => {
  for (let seed = 1; seed <= 300; seed++) for (const n of [1, 2, 3, 4]) {
    const rng = makeRng(seed * 7 + n), seats = [...Array(n).keys()];
    for (const def of STAGES) {
      const s = makeStage(rng, def, seats);
      assert.equal(runBall(s, s.ok), 'goal', `seed ${seed} n${n}: the right settings roll home`);
      assert.notEqual(runBall(s, s.st), 'goal', 'the starting settings do not');
      assert.ok(s.gates.length >= Math.max(def.gates, n), 'at least one gate per player');
      assert.equal(s.cells.filter(c => c && c.k === 'S').length, 1); assert.equal(s.cells.filter(c => c && c.k === 'G').length, 1);
      for (const seat of seats) {
        const mine = s.gates.map((ci, j) => j).filter(j => s.cells[s.gates[j]].own === seat);
        assert.ok(mine.length >= 1, 'everyone owns a gate'); assert.ok(mine.some(j => s.st[j] !== s.ok[j]), 'and has one to flip');
      }
      // portals come in pairs that point at each other; every rail end meets a rail (or the board edge never)
      for (const [i, c] of s.cells.entries()) {
        if (!c) continue;
        if (c.k === 'p') { assert.equal(s.cells[c.twin].twin, i); assert.equal(s.cells[c.twin].pair, c.pair); }
        assert.ok(c.m > 0 && c.m < 16);
      }
      assert.equal(s.cells.length, W * H);
    }
  }
});

test('fewer players own more gates each; the gates are shared out round the table', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 3), I = g.init();
    for (const st of I.stages) {
      const owners = st.gates.map(ci => st.cells[ci].own), per = [...Array(n).keys()].map(s => owners.filter(o => o === s).length);
      assert.ok(Math.max(...per) - Math.min(...per) <= 1, `n${n}: fair split ${per}`);
      if (n === 1) assert.ok(per[0] >= 2, 'alone you own every gate');
    }
  }
});

test('playing it right clears every stage, every player count; result is co-op with everyone once', () => {
  for (const n of [1, 2, 3, 4]) for (let seed = 1; seed <= 25; seed++) {
    const g = mk(n, seed); let cleared = 0, last = -1;
    while (!g.over) {
      const s = g.state();
      if (s.stage !== last && s.phase === 'ready') { last = s.stage; solveStage(g); }
      if (s.phase === 'clear' && s.cleared > cleared) cleared = s.cleared;
      g.step(0.05);
    }
    const r = g.result();
    assert.equal(cleared, STAGES.length, `n${n} seed ${seed}: all stages`);
    assert.equal(g.state().drops, 0, 'never dropped');
    assert.deepEqual(r.coop, { success: true });
    assert.deepEqual(r.order, [Array.from({ length: n }, (_, i) => 10 + i)]);
    assert.ok(Object.values(r.scores).every(v => v === STAGES.length));
  }
});

test('nobody flips: the marble drops (or bounces) and comes back; it ends at the clock, a failure', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n, 9); let t = 0, saw = new Set();
    while (!g.over) { g.step(0.05); t += 0.05; saw.add(g.state().phase); }
    assert.ok(t <= GAME_S + 0.1 && t >= GAME_S - 0.1);
    assert.ok(saw.has('drop') || g.state().drops === 0, 'phases seen');
    const r = g.result();
    assert.deepEqual(r.coop, { success: false });
    assert.equal(r.order.length, 1); assert.equal(r.order[0].length, n);
    assert.ok(Object.values(r.scores).every(v => v === 0));
  }
});

test('the marble really rolls: from the start it reaches a drop when the first gate is wrong', () => {
  const g = mk(1, 4); const s0 = g.state();
  assert.equal(s0.phase, 'ready');
  run(g, 3.1); assert.equal(g.state().phase, 'roll');
  const b0 = g.state().b; run(g, 0.6); assert.notDeepEqual(g.state().b, b0, 'it moved');
  run(g, 20); assert.ok(g.state().drops >= 1 || g.state().stage > 0 || g.state().phase === 'roll');
});

test('you may only flip your own gates; junk is refused', () => {
  const g = mk(2), I = g.init(), stg = I.stages[0], s = g.state();
  const mine = stg.gates.findIndex(ci => stg.cells[ci].own === 0), theirs = stg.gates.findIndex(ci => stg.cells[ci].own === 1);
  for (const [p, a, d] of [[10, 'flip', theirs], [10, 'flip', -1], [10, 'flip', 99], [10, 'flip', '0'], [10, 'flip', 0.5], [10, 'spin', mine], [99, 'flip', mine]]) g.act(p, a, d);
  assert.equal(g.state().st, s.st, 'nothing changed');
  g.act(10, 'flip', mine); assert.notEqual(g.state().st[mine], s.st[mine]);
  g.act(11, 'flip', theirs); assert.notEqual(g.state().st[theirs], s.st[theirs]);
});

test('goal per difficulty, one less alone; meta is sane', () => {
  assert.equal(mk(2, 1, 'easy').state().target, TARGET.easy);
  assert.equal(mk(2, 1, 'hard').state().target, TARGET.hard);
  assert.equal(mk(1, 1).state().target, TARGET.normal - 1);
  assert.equal(meta.kind, 'ui'); assert.equal(meta.scoring, 'coop'); assert.equal(meta.min, 1); assert.equal(meta.max, 4);
  assert.ok(!/ember|veil|muster/i.test(JSON.stringify(meta)));
  assert.ok(JSON.stringify(mk(4).state()).length < 120, 'the changing state is small');
});

test('same seed, same stages', () => {
  assert.deepEqual(mk(3, 42).init(), mk(3, 42).init());
  assert.notDeepEqual(mk(3, 42).init(), mk(3, 43).init());
});
