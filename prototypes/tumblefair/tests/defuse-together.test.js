import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeModule, solve, KINDS, RULES, wireAnswer, symbolOrder } from '../js/games/defuse-together/sim.js';

const DT = 0.05;
const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 10 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
const pids = n => Array.from({ length: n }, (_, i) => 10 + i);
const step = (g, s = 1) => { for (let i = 0; i < s / DT; i++) g.step(DT); return g.events.splice(0); };
/** The team: every reader's lines put together, the holder does what they say. */
function solveNow(g) {
  const st = g.state(), lines = [...g.pages[g.mi].values()].flat();
  return solve(st.dev, lines);
}
function checkResult(g, n) {
  const r = g.result();
  assert.equal(r.order.length, 1); assert.deepEqual([...r.order[0]].sort(), pids(n), 'every player exactly once, one group');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(typeof r.coop.success, 'boolean'); assert.equal(r.unit, meta.unit);
  return r;
}

test('every module kind: the rule lines decide one answer, and it is the right one (many seeds, team and solo)', () => {
  for (const solo of [false, true]) for (const kind of KINDS) for (let s = 1; s < 120; s++) {
    const m = makeModule(makeRng(s * 31 + KINDS.indexOf(kind)), kind, solo);
    const acts = solve(m.dev, m.lines);
    assert.ok(acts && acts.length, `${kind} ${s} solvable`);
    if (kind === 'wires') { assert.equal(acts[0][1], m.ans); assert.ok(m.ans < m.dev.w.length); assert.equal(m.lines.length, solo ? 4 : 6); assert.ok(m.dev.w.length <= (solo ? 4 : 5)); }
    if (kind === 'symbols') { assert.deepEqual(acts.map(a => a[1]), m.ans); assert.equal(new Set(m.dev.s).size, m.dev.s.length); assert.equal(m.lines.filter(c => m.dev.s.every(x => c.g.includes(x))).length, 1, 'exactly one column fits'); }
    if (kind === 'switches') { assert.equal(acts[acts.length - 1][0], 'set'); assert.notDeepEqual(m.dev.sw, m.ans, 'never already right'); assert.equal(m.lines.length, solo ? 4 : 8); }
    if (kind === 'word') { assert.ok(m.dev.b.includes(m.ans)); assert.equal(new Set(m.dev.b).size, 4); const twin = m.lines.find(r => r.w !== m.dev.word && r.w.slice(0, 2) === m.dev.word.slice(0, 2)); assert.ok(twin && m.dev.b.includes(twin.l), 'the look-alike word\'s button is there too'); }
  }
});

test('wires: the first TRUE rule wins, whatever comes later', () => {
  let spread = new Set();
  for (let s = 1; s < 200; s++) { const m = makeModule(makeRng(s), 'wires', false); spread.add(m.lines.findIndex(r => wireAnswer([r], m.dev.w) >= 0 || r.c.t === 'else')); }
  assert.ok(spread.size >= 4, 'the deciding rule is not always the same line');
  assert.equal(symbolOrder([{ g: ['a', 'b', 'c', 'd', 'e'] }], ['d', 'a', 'c']).join(), '1,2,0');
});

for (const n of [2, 3, 4]) test(`${n} players: the device moves round, the book is split so readers each hold different lines`, () => {
  const g = make(n, 40 + n);
  g.mods.forEach((m, i) => {
    const op = pids(n)[i % n], pg = g.pages[i];
    assert.ok(!pg.has(op), 'the holder has no page');
    const all = [...pg.values()].flat(); assert.equal(all.length, m.lines.length, 'every line dealt once');
    if (n >= 3) assert.ok([...pg.values()].every(l => l.length > 0 && l.length < m.lines.length), 'nobody holds the whole book');
  });
  assert.equal(g.mods.length, RULES.modules.team);
  assert.equal(g.priv(10).role, 'op'); assert.equal(g.priv(11).role, 'read'); assert.ok(g.priv(11).lines.length > 0); assert.equal(g.priv(10).lines.length, 0);
});

test('only the holder can touch the device; a mistake burns the fuse', () => {
  const g = make(3, 7), st = g.state(), acts = solveNow(g);
  const f0 = g.fuse; g.act(11, acts[0][0], acts[0][1]); assert.deepEqual(g.state().dev, st.dev, 'a reader cannot act');
  // a wrong move by the holder
  const dev = g.state().dev;
  if (dev.k === 'wires') g.act(10, 'cut', dev.w.findIndex((_, i) => i !== acts[0][1]));
  else if (dev.k === 'symbols') g.act(10, 'sym', [0, 1, 2, 3].find(i => i !== acts[0][1]));
  else if (dev.k === 'switches') g.act(10, 'set', 1);
  else g.act(10, 'btn', [0, 1, 2, 3].find(i => i !== acts[0][1]));
  const ev = g.events.splice(0);
  assert.ok(ev.some(e => e.e === 'oops')); assert.ok(g.fuse <= f0 - RULES.penalty.team + 1e-9); assert.equal(g.state().mistakes, 1);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): a team that reads its lines out defuses every module and wins early`, () => {
  for (let s = 0; s < 8; s++) {
    const g = make(n, 100 + s * 13 + n); let guard = 0;
    while (!g.over && guard++ < 200) {
      step(g, 2);                                                       // two seconds of talking per move
      if (g.over || g.state().phase !== 'go') continue;
      const acts = solveNow(g); assert.ok(acts, 'the lines decide it');
      for (const [a, d] of acts) g.act(g.state().op, a, d);
    }
    const r = checkResult(g, n);
    assert.equal(r.coop.success, true); assert.equal(g.state().mistakes, 0); assert.ok(g.fuse > 0);
    if (n === 1) assert.equal(r.scores[10], RULES.points.solo * RULES.modules.solo);
    else assert.ok(Object.values(r.scores).every(v => v > 0), 'everyone helped');
  }
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): nobody touching it = it blows at the fuse, the team loses`, () => {
  const g = make(n, 60 + n); let t = 0;
  while (!g.over && t < meta.seconds) { g.step(DT); t += DT; }
  assert.ok(g.over); assert.ok(t <= RULES.fuse + 0.1 && RULES.fuse < meta.seconds);
  assert.ok(g.events.some(e => e.e === 'boom'));
  const r = checkResult(g, n); assert.equal(r.coop.success, false); assert.ok(Object.values(r.scores).every(v => v === 0));
});

test('guessing wildly burns the fuse down fast', () => {
  const g = make(2, 9); let k = 0;
  while (!g.over && k < 400) { const st = g.state(); if (st.phase === 'go') { const d = st.dev; if (d.k === 'wires') g.act(st.op, 'cut', k % d.w.length); else if (d.k === 'symbols') g.act(st.op, 'sym', k % 4); else if (d.k === 'switches') g.act(st.op, 'set', 1); else g.act(st.op, 'btn', k % 4); } g.step(DT); k++; }
  assert.ok(g.over); assert.ok(k < 400, 'ends in well under 20 s');
});
