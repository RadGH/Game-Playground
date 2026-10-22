import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES } from '../js/games/fizzpop-pass/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 50 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, (typeof inputs === 'function' ? inputs(pid) : inputs[pid]) ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit); return r;
}
const toReady = g => { let i = 0; while (g.phase === 'ready' && i++ < 200) tick(g); };
const place = (b, x, z) => { b.x = x; b.z = z; b.vx = b.vz = 0; };
// holder chases the nearest other player; everyone else runs away from the holder
const bot = (g, pid) => {
  const me = g.bodies.get(pid), h = g.holder; if (h == null) return null;
  if (h === pid) { let t = null, bd = 99; for (const [q, b] of [...g.bodies, ...[-1, -2].filter(id => g.racer(id)).map(id => [id, g.racer(id).b])]) if (q !== pid && !(b.flags & F.GHOST)) { const d = Math.hypot(b.x - me.x, b.z - me.z); if (d < bd) { bd = d; t = b; } } if (!t) return null; const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d, b: 0 }; }
  const H = g.racer(h).b, dx = me.x - H.x, dz = me.z - H.z, d = Math.hypot(dx, dz) || 1;
  return { mx: dx / d - me.x * 0.12, mz: dz / d - me.z * 0.12, b: 0 };
};

for (const n of [1, 2, 3, 4]) test(`${n} player(s) with bots: someone gets splatted, it ends by itself, result shape`, () => {
  const g = make(n, n + 2); const ev = []; let i = 0;
  while (!g.over && i++ < (meta.seconds + 5) / DT) ev.push(...tick(g, pid => bot(g, pid)));
  assert.ok(g.over); assert.ok(i <= (meta.seconds + 4) / DT);
  assert.ok(ev.some(e => e.e === 'pop')); assert.ok(ev.some(e => e.e === 'pass'));
  const r = checkResult(g, n);
  if (n > 1) { const done = ev.find(e => e.e === 'done'); if (done.win != null) assert.deepEqual(r.order[0], [done.win]); }
});

test('standing still: the holder pops, loses a life, everyone else scores, and the pie moves to someone else', () => {
  const g = make(3, 4); toReady(g);
  const h = g.holder; assert.ok(h != null);
  assert.ok(g.bodies.get(h).flags & F.BOOST, 'holder runs faster');
  const ev = []; let i = 0; while (!ev.some(e => e.e === 'pop') && i++ < 400) ev.push(...tick(g));
  const pop = ev.find(e => e.e === 'pop'); assert.equal(pop.id, h); assert.ok(i * DT >= RULES.fuse[0] - 0.1 && i * DT <= RULES.fuse[1] + 0.1);
  const st = g.state(); assert.equal(st.lv[h], RULES.lives(3) - 1);
  for (const pid of g.bodies.keys()) assert.equal(st.sc[pid], pid === h ? 0 : 1);
  for (let k = 0; k < RULES.pause / DT + 2; k++) tick(g);
  assert.equal(g.phase, 'live'); assert.notEqual(g.holder, h, 'someone else gets it');
});

test('bumping passes it; it cannot go straight back; A passes from close by', () => {
  const g = make(2, 5), [a, b] = g.bodies.keys(); toReady(g);
  const holder = g.holder, other = holder === a ? b : a, H = g.bodies.get(holder), O = g.bodies.get(other);
  place(H, 0, 3); place(O, 3, 3);
  for (let k = 0; k < RULES.holdMin / DT + 1; k++) tick(g);
  place(O, 0.9, 3);
  const ev = tick(g); assert.ok(ev.some(e => e.e === 'pass' && e.to === other && e.from === holder), 'bump passed it');
  // the new holder is right next to the giver but cannot hand it back for a while
  const ev2 = []; for (let k = 0; k < (RULES.noBack - 0.2) / DT; k++) { place(H, 0, 3); place(O, 0.9, 3); ev2.push(...tick(g, { [other]: { mx: 0, mz: 0, b: k % 2 ? IN.A : 0 } })); }
  assert.ok(!ev2.some(e => e.e === 'pass'), 'no pass-back'); assert.ok(ev2.some(e => e.e === 'nopass' && e.back), 'told why');
  for (let k = 0; k < 6; k++) tick(g);
  assert.equal(g.holder, holder, 'after the no-pass-back it can go back');
  // A passes from 1.6 m
  for (let k = 0; k < RULES.noBack / DT + 1; k++) { place(H, 0, 3); place(O, 1.6, 3); tick(g); }
  assert.equal(g.holder, holder, 'not by bumping at 1.6 m');
  const ev3 = tick(g, { [holder]: { mx: 0, mz: 0, b: IN.A } }); assert.ok(ev3.some(e => e.e === 'pass' && e.to === other));
});

test('losing every life puts you on the blanket; last one standing wins +2 and the game ends early', () => {
  const g = make(2, 7), [a, b] = g.bodies.keys(); toReady(g);
  let i = 0, ev = [];
  while (!g.over && i++ < 3000) {
    ev.push(...tick(g, { [a]: null, [b]: null }));
  }
  assert.ok(g.over); const r = checkResult(g, 2);
  const out = [a, b].find(p => g.racer(p).out), win = [a, b].find(p => p !== out);
  assert.ok(out != null, 'somebody ran out of lives'); assert.deepEqual(r.order, [[win], [out]]);
  assert.ok(r.scores[win] >= RULES.lives(2) + RULES.winBonus); assert.ok(g.bodies.get(out).flags & F.GHOST);
  assert.ok(i * DT < meta.seconds, 'early');
});

test('solo: two CPU picnickers pass it about; splatting them scores; same seed same game', () => {
  const play = () => { const g = make(1, 9); const ev = []; let i = 0; while (!g.over && i++ < (meta.seconds + 5) / DT) ev.push(...tick(g, pid => bot(g, pid))); return { g, ev }; };
  const x = play(), y = play();
  assert.equal(JSON.stringify(x.ev), JSON.stringify(y.ev));
  const pops = x.ev.filter(e => e.e === 'pop');
  assert.ok(pops.some(e => e.id < 0), 'a CPU got splatted');
  assert.equal(x.g.result().scores[50], pops.filter(e => e.id < 0).length);
  assert.ok(x.ev.some(e => e.e === 'pass' && e.from < 0 && e.to === 50), 'a CPU caught the player');
  assert.ok(x.g.state().cpu.length === 2);
});

test('the fizz level climbs as the fuse burns but is never exact', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    const g = make(2, seed); toReady(g); const hs = [];
    while (g.phase === 'live') { hs.push(g.state().h); tick(g); }
    assert.ok(hs[hs.length - 1] >= 2, 'hot at the end'); assert.ok(hs[0] <= 1, 'calm at the start');
    seen.add(hs.findIndex(h => h >= 3) / hs.length > 0 ? Math.round(hs.findIndex(h => h >= 3) / hs.length * 20) : -1);
  }
  assert.ok(seen.size > 1, 'the top level starts at different points of the fuse');
});
