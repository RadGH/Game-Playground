import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeBoard, powered, owners, turn, STAGES, TARGET, GAME_S, N, E, S, W } from '../js/games/circuit-scramble/sim.js';

const mk = (n, seed = 6, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty });
const pidOfSeat = seat => 10 + seat;
/** Tap every tile back to the solved turn, each by its owner. */
function solve(g) {
  const s = g.state();
  for (let i = 0; i < s.r.length; i++) { const o = s.o[i]; if (o === '-') continue; for (let k = 0; k < (4 - +s.r[i]) % 4; k++) g.act(pidOfSeat(+o), 'rot', i); }
}

test('turning a wire: four quarter turns come back round', () => {
  assert.equal(turn(N), E); assert.equal(turn(N | E), E | S); assert.equal(turn(W), N); assert.equal(turn(N | S, 2), N | S);
  for (let m = 0; m < 16; m++) assert.equal(turn(m, 4), m);
});

test('the generator: every board is a tree that powers every bulb when solved (thousands of boards)', () => {
  for (let seed = 1; seed <= 400; seed++) for (const st of STAGES) {
    const b = makeBoard(makeRng(seed), st.w, st.h, st.bulbs);
    const on = powered(b.tiles, b.w, b.h, b.src);
    assert.ok(on.every(Boolean), 'a spanning tree reaches every cell');
    assert.ok(b.bulbs.length >= 1 && b.bulbs.length <= st.bulbs);
    assert.ok(!b.bulbs.includes(b.src));
    for (const i of b.bulbs) assert.equal([N, E, S, W].filter(x => b.tiles[i] & x).length, 1, 'bulbs sit on dead ends');
    let edges = 0; for (const m of b.tiles) edges += [N, E, S, W].filter(x => m & x).length;
    assert.equal(edges / 2, st.w * st.h - 1, 'a tree: one fewer wire than tiles');
  }
});

test('a scrambled board starts unlit and is solvable by its owners, every stage, every player count', () => {
  for (const n of [1, 2, 3, 4]) for (let seed = 1; seed <= 40; seed++) {
    const g = mk(n, seed);
    let stages = 0;
    while (!g.over) {
      const s = g.state();
      if (s.phase === 'play') {
        assert.ok(s.bulbs.some(b => s.p[b] === '0'), 'not lit at the start');
        solve(g); stages++;
        assert.equal(g.state().phase, 'clear', `n${n} seed ${seed} stage ${s.stage}: solved`);
      }
      g.step(0.05);
    }
    assert.equal(stages, STAGES.length);
    const r = g.result();
    assert.equal(r.coop.success, true); assert.equal(r.order.length, 1); assert.equal(r.order[0].length, n);
    assert.ok(Object.values(r.scores).every(v => v === STAGES.length));
  }
});

test('the board is split into one part per player; battery and bulbs belong to nobody', () => {
  for (const n of [1, 2, 3, 4]) for (const st of STAGES) {
    const fixed = new Set([0, st.w * st.h - 1]);
    const o = owners(st.w, st.h, [...Array(n).keys()], fixed);
    assert.equal(o[0], -1); assert.equal(o[st.w * st.h - 1], -1);
    const seen = new Set(o.filter(x => x >= 0));
    if (st.w >= 4) assert.equal(seen.size, n, `${n} players on ${st.w}x${st.h}: everyone has tiles`);
  }
});

test('you may only turn your own tiles; junk is refused', () => {
  const g = mk(2);
  const s = g.state(), mine = s.o.indexOf('0'), theirs = s.o.indexOf('1'), fixed = s.o.indexOf('-');
  g.act(10, 'rot', theirs); g.act(10, 'rot', fixed); g.act(10, 'rot', -1); g.act(10, 'rot', 99); g.act(10, 'rot', '0'); g.act(10, 'rot', 1.5); g.act(10, 'spin', mine); g.act(99, 'rot', mine);
  assert.equal(g.state().r, s.r, 'nothing turned');
  g.act(10, 'rot', mine);
  assert.equal(+g.state().r[mine], (+s.r[mine] + 1) % 4);
  g.act(11, 'rot', theirs);
  assert.equal(+g.state().r[theirs], (+s.r[theirs] + 1) % 4);
});

test('nobody taps: it ends at the clock, a failure with 0 boards each', () => {
  for (const n of [1, 2, 3, 4]) {
    const g = mk(n); let t = 0;
    while (!g.over && t < meta.seconds) { g.step(0.05); t += 0.05; }
    assert.ok(g.over); assert.ok(t <= GAME_S + 0.1);
    const r = g.result();
    assert.deepEqual(r.coop, { success: false });
    assert.deepEqual(r.order, [Array.from({ length: n }, (_, i) => 10 + i)]);
    assert.ok(Object.values(r.scores).every(v => v === 0));
  }
});

test('reaching the target is a win; one short is not; solo needs one fewer', () => {
  for (const [diff, tgt] of Object.entries(TARGET)) {
    const g = mk(3, 2, diff); assert.equal(g.init().target, tgt);
    for (let k = 0; k < tgt - 1; k++) { solve(g); while (g.state().phase === 'clear') g.step(0.05); }
    while (!g.over) g.step(0.05);
    assert.equal(g.result().coop.success, false);
    const h = mk(3, 2, diff);
    for (let k = 0; k < tgt; k++) { solve(h); while (h.state().phase === 'clear') h.step(0.05); }
    while (!h.over) h.step(0.05);
    assert.equal(h.result().coop.success, true); assert.ok(Object.values(h.result().scores).every(v => v === tgt));
  }
  assert.equal(mk(1).init().target, TARGET.normal - 1);
});

test('state is small and only changes on a tap or a new board', () => {
  const g = mk(4);
  const s0 = JSON.stringify(g.state()); g.step(0.05); assert.equal(JSON.stringify(g.state()), s0);
  for (let i = 0; i < STAGES.length - 1; i++) { solve(g); while (g.state().phase === 'clear') g.step(0.05); }
  assert.ok(JSON.stringify(g.state()).length < 400);
});
