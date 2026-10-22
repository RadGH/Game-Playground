import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, MODE } from '../js/games/ring-a-ding-rumble/sim.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 40 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); const ev = g.events.splice(0); g.state(); return ev;
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const place = (b, x, z, yaw) => { b.x = x; b.z = z; b.vx = b.vz = 0; if (yaw != null) b.yaw = yaw; };
/** Two boxers face to face, a metre apart. */
function bout(seed = 3) {
  const g = make(2, seed), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  place(A, -0.5, 0, Math.PI / 2); place(B, 0.5, 0, -Math.PI / 2);
  return { g, a, b, A, B, fa: g.fighters.get(a), fb: g.fighters.get(b) };
}
const tap = key => i => (i === 0 ? key : 0);
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort(), 'every player exactly once');
  assert.equal(Object.keys(r.scores).length, n); assert.equal(r.unit, meta.unit);
  return r;
}

for (const n of [2, 3, 4]) test(`${n} boxers standing still: the bell at ${meta.seconds} s, one shared place`, () => {
  const g = make(n, n); let steps = 0;
  while (!g.over && steps < meta.seconds / DT + 5) { tick(g); steps++; }
  assert.ok(g.over); assert.ok(Math.abs(steps * DT - meta.seconds) < 0.2);
  const r = checkResult(g, n); assert.equal(r.order.length, 1);
  for (const b of g.bodies.values()) assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd);
});

test('a jab lands a moment after the press: 1 point, damage, a shove, a flinch, and it costs puff', () => {
  const { g, a, b, B, fa, fb } = bout();
  const ev = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'jab' && e.id === a));
  const hit = ev.find(e => e.e === 'hit'); assert.ok(hit && hit.id === b && hit.by === a && hit.k === 'jab');
  assert.equal(fa.pts, RULES.jab.pts); assert.equal(fb.hp, RULES.hp - RULES.jab.dmg);
  assert.ok(B.x > 0.6, 'pushed back'); assert.ok(fa.puff < RULES.puff);
  assert.ok(ev.findIndex(e => e.e === 'jab') < ev.findIndex(e => e.e === 'hit'));
});

test('out of reach or facing away is a whiff; the punch aims itself at someone roughly in front', () => {
  const { g, a, A, B, fa } = bout(); place(B, 3, 0);
  let ev = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'whiff' && e.id === a)); assert.equal(fa.pts, 0);
  place(B, 0.3, 0.9); place(A, -0.3, 0, Math.PI / 2);         // off to one side but in front-ish: aim assist turns to them
  run(g, 0.5);
  ev = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'hit'), 'aim assist found them');
});

test('blocking: a jab into a guard does nothing; a big swing drains puff and can break the guard', () => {
  const { g, a, b, fa, fb } = bout();
  let ev = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 }, [b]: { mx: 0, mz: 0, b: IN.B } }));
  assert.ok(ev.some(e => e.e === 'block' && e.id === b)); assert.ok(!ev.some(e => e.e === 'hit'));
  assert.equal(fb.hp, RULES.hp); assert.equal(fa.pts, 0); assert.equal(g.state().f[b][3], MODE.BLOCK);
  // a block from behind does not count
  const g2 = bout(); g2.B.yaw = Math.PI / 2;            // b faces away from a
  ev = run(g2.g, 0.3, i => ({ [g2.a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 }, [g2.b]: { mx: 0, mz: 0, b: IN.B } }));
  assert.ok(ev.some(e => e.e === 'hit'), 'hit in the back');
  // a guard with little puff left breaks under a big swing
  fb.puff = 10; fa.puff = 100;
  ev = run(g, 1.2, i => ({ [a]: { mx: 0, mz: 0, b: i < 19 ? IN.A : 0 }, [b]: { mx: 0, mz: 0, b: IN.B } }));
  assert.ok(ev.some(e => e.e === 'hay' && e.id === a));
  assert.ok(ev.some(e => e.e === 'break' && e.id === b), JSON.stringify(ev.map(e => e.e)));
  assert.ok(fb.hp < RULES.hp, 'some damage gets through');
});

test('hold A for a big swing: it goes when you let go, or by itself at full power — and hits harder than a jab', () => {
  const { g, a, b, fa, fb } = bout();
  // let go after 0.5 s
  let ev = run(g, 0.9, i => ({ [a]: { mx: 0, mz: 0, b: i < 10 ? IN.A : 0 } }));
  const hits = ev.filter(e => e.e === 'hit');
  assert.ok(ev.some(e => e.e === 'hay')); assert.equal(hits.length, 2, 'jab on the press, then the swing');
  assert.ok(hits[1].k === 'hay' && hits[1].dmg > RULES.jab.dmg);
  assert.equal(fa.pts, RULES.jab.pts + RULES.hay.pts);
  // held to full: goes by itself, the full-power numbers
  const t2 = bout(); t2.fb.hp = 100;
  ev = run(t2.g, 1.5, { [t2.a]: { mx: 0, mz: 0, b: IN.A } });
  const big = ev.filter(e => e.e === 'hit' && e.k === 'hay');
  assert.equal(big.length, 1, 'one swing however long you hold'); assert.equal(big[0].dmg, RULES.hay.dmgFull);
  assert.ok(fb.hp < 100);
  // while winding up you move slowly
  const t3 = bout(); run(t3.g, 0.5, { [t3.a]: { mx: 0, mz: 0, b: IN.A } }); assert.ok(t3.A.flags & F.SLOW);
});

test('mashing runs out of puff: punches stop until you catch your breath', () => {
  const { g, a, fa } = bout();
  const ev = run(g, 8, i => ({ [a]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'puff' && e.to === a), 'ran dry');
  const jabs = ev.filter(e => e.e === 'jab').length;
  assert.ok(jabs < 8 / 0.4, `${jabs} jabs`);
  run(g, 3); assert.ok(fa.puff > 50, 'puff comes back');
});

test('knockdowns: down on the mat, back up with less health; the third is out and a 2-player bout ends', () => {
  const { g, a, b, fa, fb } = bout();
  fb.hp = 5; let ev = run(g, 0.3, tap(0) && (i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } })));
  assert.ok(ev.some(e => e.e === 'down' && e.id === b && e.by === a && e.n === 1));
  assert.equal(g.state().f[b][3], MODE.DOWN); assert.ok(g.bodies.get(b).flags & F.STUN);
  assert.equal(fa.pts, RULES.jab.pts + RULES.downPts);
  // nothing can hit you while you are down
  ev = run(g, 0.4, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } })); assert.ok(!ev.some(e => e.e === 'hit'));
  ev = run(g, RULES.downTime);
  assert.ok(ev.some(e => e.e === 'up' && e.id === b)); assert.equal(fb.hp, RULES.upHp[0]);
  assert.ok(g.bodies.get(b).flags & F.GHOST, 'a moment of safety');
  for (let k = 2; k <= RULES.downs; k++) {
    run(g, RULES.upGhost + 0.1); place(g.bodies.get(a), -0.5, 0, Math.PI / 2); place(g.bodies.get(b), 0.5, 0, -Math.PI / 2);
    fb.hp = 1; fa.puff = 100; ev = run(g, 0.3, i => ({ [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
    assert.ok(ev.some(e => e.e === (k === RULES.downs ? 'out' : 'down') && e.id === b), `knockdown ${k}`);
    if (k < RULES.downs) run(g, RULES.downTime + 0.05);
  }
  assert.ok(g.bodies.get(b).flags & F.OUT);
  run(g, RULES.endPause + 0.2); assert.ok(g.over, 'last one standing');
  assert.deepEqual(checkResult(g, 2).order, [[a], [b]]);
});

test('free-for-all: knocked-out boxers are ordered last-out-first, standing ones by points', () => {
  const g = make(4, 6), ids = [...g.bodies.keys()], fs = ids.map(id => g.fighters.get(id));
  fs[0].pts = 3; fs[1].pts = 12;
  const ko = (f, by) => { f.hp = 1; f.downs = RULES.downs - 1; place(f.b, 0.5, 0, -Math.PI / 2); place(by.b, -0.5, 0, Math.PI / 2); by.puff = 100; return run(g, 0.3, i => ({ [by.id]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } })); };
  place(fs[2].b, 3, 3); place(fs[3].b, -3, 3);
  assert.ok(ko(fs[3], fs[0]).some(e => e.e === 'out'));
  place(fs[3].b, -3.5, -3.5);
  run(g, 1);
  assert.ok(ko(fs[2], fs[0]).some(e => e.e === 'out'));
  assert.ok(!g.over);
  run(g, 10);
  const r = checkResult(g, 4);
  assert.deepEqual(r.order, [[ids[1]], [ids[0]], [ids[2]], [ids[3]]], JSON.stringify(r));
});

test('dodge: B with the stick darts that way and nothing can hit you for a moment', () => {
  const { g, a, b, B, fb } = bout();
  const x0 = B.x;
  const ev = run(g, 0.2, i => ({ [b]: { mx: 0, mz: 1, b: i === 0 ? IN.B : 0 }, [a]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(ev.some(e => e.e === 'dodge' && e.id === b)); assert.ok(!ev.some(e => e.e === 'hit'), 'dodged the jab');
  assert.ok(B.z > 1, `darted ${B.z} m`); assert.ok(fb.puff < RULES.puff); assert.equal(B.x, x0);
});

test('a big hit into the ropes bounces you back off them', () => {
  const { g, a, A, B } = bout(); place(A, 2.6, 0, Math.PI / 2); place(B, 3.4, 0, -Math.PI / 2);
  const ev = run(g, 1.6, { [a]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'rope' && e.side === 'e'), JSON.stringify(ev.map(e => e.e)));
  assert.ok(B.x <= meta.arena.hw);
});

test('solo: Bolster the CPU fights back — stand still and you get knocked out; beat him and it ends early too', () => {
  const g = make(1, 8), pid = 40; let steps = 0; const ev = [];
  while (!g.over && steps < meta.seconds / DT + 5) { ev.push(...tick(g)); steps++; }
  assert.ok(g.over); assert.ok(steps * DT < meta.seconds, 'ended before the bell');
  assert.ok(ev.some(e => e.e === 'hit' && e.by === -1 && e.id === pid)); assert.ok(ev.some(e => e.e === 'out' && e.id === pid));
  assert.deepEqual(checkResult(g, 1).order, [[pid]]);
  assert.ok(g.state().cpu.length === 5);
  // knock Bolster out
  const g2 = make(1, 9), cpu = g2.fighters.get(-1), me = g2.fighters.get(pid);
  for (let k = 0; k < RULES.downs; k++) { run(g2, k ? RULES.downTime + RULES.upGhost + 0.1 : 0.05); cpu.hp = 1; place(cpu.b, 0.5, 0); place(me.b, -0.5, 0, Math.PI / 2); me.puff = 100; me.rec = 0; cpu.block = false; cpu.ai.hold = 99; cpu.ai.bits = 0; run(g2, 0.25, i => ({ [pid]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } })); }
  run(g2, RULES.endPause + 0.2);
  assert.ok(g2.over); assert.ok(cpu.out); assert.ok(me.pts >= RULES.downs * RULES.downPts);
});

test('a harder Bolster hits harder', () => {
  const dmg = d => { const g = make(1, 11, d); const ev = run(g, 30); return ev.filter(e => e.e === 'hit' && e.by === -1).map(e => e.dmg)[0]; };
  assert.ok(dmg('hard') > dmg('easy'));
});

test('state is small and rounded; same seed, same fight', () => {
  const sim = () => { const g = make(4, 2); run(g, 10, i => Object.fromEntries([...g.bodies.keys()].map((p, j) => [p, { mx: Math.sin(i * 0.1 + j), mz: Math.cos(i * 0.13 + j), b: (i + j) % 5 === 0 ? IN.A : (i + j) % 17 === 0 ? IN.B : 0 }]))); return g; };
  const g = sim(), s = JSON.stringify(g.state());
  assert.ok(s.length < 300, `${s.length} bytes`); assert.ok(!/\d\.\d{3,}/.test(s));
  assert.equal(JSON.stringify([...sim().bodies.values()]), JSON.stringify([...g.bodies.values()]));
});
