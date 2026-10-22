import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { meta, create, makeBoard, scoreOf, settleFlip, cpuPick, neighbours, W, H, FLIPS, TICK_S, START_S, END_S } from '../js/games/tile-flip-race/sim.js';

const mk = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i })), difficulty });
const run = (g, s) => { for (let t = 0; t < s && !g.over; t += 0.05) g.step(0.05); };
const toPlay = g => { while (g.state().phase !== 'play') g.step(0.05); };
const toFlip = g => { const f = g.state().flip; while (g.state().flip === f && !g.over) g.step(0.05); };
/** The first tile a who-index may pick, from a board state string. */
const canPick = (g, k) => { const s = g.state(), init = g.init(), homes = init.who.map(w => w.home); for (let i = 0; i < W * H; i++) if (init.values[i] > 0 && s.o[i] !== String(k) && !homes.includes(i) && neighbours(i).some(j => s.o[j] === String(k))) return i; return null; };

test('boards are mirrored both ways, every tile reachable, corners plain', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const v = makeBoard(makeRng(seed));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = v[y * W + x]; assert.equal(a, v[y * W + (W - 1 - x)]); assert.equal(a, v[(H - 1 - y) * W + x]); }
    for (const c of [0, W - 1, W * (H - 1), W * H - 1]) assert.equal(v[c], 1);
    assert.ok(v.includes(3) && v.includes(2) && v.includes(-1));
  }
});

test('scoring: tile values + the biggest joined-up patch', () => {
  const values = new Array(W * H).fill(1); values[1] = 3; values[2] = 2;
  const owner = new Array(W * H).fill(-1); owner[0] = 0; owner[1] = 0; owner[2] = 0; owner[20] = 0;
  assert.deepEqual(scoreOf(values, owner, 0), { tiles: 7, bonus: 3, total: 10 });
  owner[1] = 1;                                           // cut in the middle: two patches of 1
  assert.deepEqual(scoreOf(values, owner, 0), { tiles: 4, bonus: 1, total: 5 });
});

test('a flip: picks must touch your land; the same tile twice bounces; steals work, home corners never fall', () => {
  const values = new Array(W * H).fill(1), owner = new Array(W * H).fill(-1), homes = [0, W * H - 1];
  owner[0] = 0; owner[W * H - 1] = 1; owner[1] = 0; owner[2] = 1;
  let r = settleFlip(values, owner, homes, { 0: 2, 1: 3 });     // 0 steals tile 2 (next to its tile 1); 1 takes 3 next to 2
  assert.deepEqual(r.bounced, []); assert.equal(owner[2], 0); assert.equal(owner[3], 1);
  r = settleFlip(values, owner, homes, { 0: 10, 1: W * H - 1 }); // not next to 0's land; 1's own home: both refused
  assert.deepEqual(r.flips, []); assert.equal(owner[10], -1);
  owner[9] = 1; r = settleFlip(values, owner, homes, { 0: 8, 1: 8 }); // both next to tile 8: bounce
  assert.deepEqual(r.bounced, [8]); assert.equal(owner[8], -1);
  r = settleFlip(values, owner, homes, { 1: 0 }); assert.equal(owner[0], 0, 'a home corner cannot be stolen');
});

test('the picks land together every 2 seconds; 20 flips; ends by itself inside the clock', () => {
  const g = mk(2); toPlay(g);
  const k = canPick(g, 0); g.act(1, 'pick', k); assert.equal(g.priv(1).pick, k);
  assert.ok(!JSON.stringify(g.state()).includes(`"pick"`), 'picks are private');
  assert.deepEqual(g.state().in, [1]);
  toFlip(g); assert.equal(g.state().o[k], '0'); assert.equal(g.priv(1).pick, null, 'picks reset each flip');
  run(g, meta.seconds + 1); assert.ok(g.over);
  assert.ok(START_S + FLIPS * TICK_S + END_S <= meta.seconds);
});

test('bad picks are refused', () => {
  const g = mk(2); g.act(1, 'pick', 1); assert.equal(g.priv(1).pick, null, 'not before play');
  toPlay(g);
  for (const d of [-5, 999, 1.5, '1', null, { i: 1 }, 0, 24]) { g.act(1, 'pick', d); assert.equal(g.priv(1).pick, null, JSON.stringify(d)); }
  g.act(99, 'pick', 1); assert.equal(g.state().in.length, 0, 'a stranger cannot pick');
});

test('solo: Tumbleweed (CPU) grows its own land; the result has only the player', () => {
  const g = mk(1); toPlay(g);
  assert.equal(g.init().who.length, 2); assert.equal(g.init().who[1].cpu, true);
  run(g, 10); assert.ok(g.state().scores.cpu > 3, 'the CPU took tiles');
  run(g, 60); assert.ok(g.over);
  const r = g.result(); assert.deepEqual(r.order, [[1]]); assert.equal(typeof r.scores[1], 'number'); assert.equal(r.scores.cpu, undefined);
});

test('the CPU always picks a legal tile, at every difficulty', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const rng = makeRng(9), values = makeBoard(rng), owner = new Array(W * H).fill(-1); owner[0] = 0; owner[W * H - 1] = 1;
    for (let t = 0; t < 30; t++) {
      const i = cpuPick(values, owner, [0, W * H - 1], 1, rng, d); if (i == null) break;
      assert.ok(values[i] > 0 && owner[i] !== 1 && neighbours(i).some(j => owner[j] === 1));
      owner[i] = 1;
    }
  }
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s): every pid placed once, best first, ties share`, () => {
  const g = mk(n, 20 + n); toPlay(g);
  while (!g.over) {
    for (let p = 1; p <= n; p++) { const k = canPick(g, p - 1); if (k != null && (p + g.state().flip) % 3) g.act(p, 'pick', k); }
    toFlip(g); if (g.state().phase === 'end') run(g, END_S + 1);
  }
  const r = g.result();
  assert.deepEqual(r.order.flat().sort(), Array.from({ length: n }, (_, i) => i + 1));
  const s = r.order.map(grp => r.scores[grp[0]]); for (let i = 1; i < s.length; i++) assert.ok(s[i] < s[i - 1]);
  for (const grp of r.order) for (const p of grp) assert.equal(r.scores[p], r.scores[grp[0]]);
});

test('a tie on score shares first place', () => {
  const g = mk(2); run(g, 60);                      // nobody picks: both keep only their home corner
  assert.deepEqual(g.result().order, [[1, 2]]);
});
