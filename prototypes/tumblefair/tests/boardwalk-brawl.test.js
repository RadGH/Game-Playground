import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, ST, W, HD } from '../js/games/boardwalk-brawl/sim.js';
import { LEVELS, FOES, BOSSES } from '../js/games/boardwalk-brawl/levels.js';

const make = (n, seed = 3, difficulty = 'normal') => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 20 + i, seat: i, name: 'P' + i })), difficulty });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit); return r;
}
/** A bot that walks right and punches whatever is closest, kicking now and then. */
function bot(g, pid, i) {
  const b = g.bodies.get(pid), foes = g.debug.foes.filter(e => e.hp > 0 && e.st !== ST.fly);
  let near = null, best = 1e9; for (const e of foes) { const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < best) { best = d; near = e; } }
  if (!near) return { mx: 1, mz: 0, b: 0 };
  const dx = near.x - b.x, dz = near.z - b.z;
  if ((near.st === ST.wind || near.st === ST.windSlam || near.st === ST.windCharge) && best < 3.2) return { mx: -Math.sign(dx), mz: -Math.sign(dz || 1), b: 0 };   // it is winding up: step away
  const range = 1.3 + near.def.scale * 0.3; if (Math.abs(dz) > 0.35 || Math.abs(dx) > range) return { mx: Math.abs(dx) > range - 0.3 ? Math.sign(dx) : Math.sign(dx) * 0.2, mz: Math.max(-1, Math.min(1, dz * 2)), b: i % 31 === 0 ? IN.B : 0 };
  return { mx: Math.sign(dx) * 0.2, mz: 0, b: i % 2 ? IN.A : 0 };          // face it, mash punch
}
const runBots = (g, steps = (meta.seconds + 1) / DT) => { const ev = []; for (let i = 0; i < steps && !g.over; i++) { const inp = {}; for (const pid of g.bodies.keys()) inp[pid] = bot(g, pid, i + pid); ev.push(...tick(g, inp)); } return ev; };

test('levels are well formed data', () => {
  assert.ok(LEVELS.length >= 3);
  for (const L of LEVELS) {
    assert.ok(L.id && L.name && L.length > W * 3 && L.theme?.props, L.id);
    let last = 0;
    for (const w of L.waves) { assert.ok(w.at > last && w.at <= L.length, `${L.id} wave at ${w.at}`); last = w.at; for (const k of [...w.foes, ...(w.more || [])]) assert.ok(FOES[k], `${L.id}: foe ${k}`); }
    assert.ok(BOSSES[L.waves.at(-1).boss], `${L.id} ends with a boss`);
  }
});

test('the seed picks the level, and init sends its arena with the screen walls', () => {
  const seen = new Set();
  for (let s = 1; s <= 6; s++) { const g = make(2, s); seen.add(g.debug.level); const i = g.init(); assert.equal(i.arena.blocks.length, 2); assert.equal(i.arena.hd, HD); assert.ok(i.arena.wall); }
  assert.equal(seen.size, LEVELS.length);
});

for (const n of [1, 2, 3, 4]) test(`${n} player(s) standing still: the first wave downs them and the game ends early, result well formed`, () => {
  const g = make(n, 5);
  let steps = 0; const ev = [];
  while (!g.over && steps < (meta.seconds + 1) / DT) { ev.push(...tick(g, steps < 30 ? Object.fromEntries([...g.bodies.keys()].map(p => [p, { mx: 1, mz: 0, b: 0 }])) : {})); steps++; }
  assert.ok(g.over); assert.ok(steps <= meta.seconds / DT + 1);
  checkResult(g, n);
  for (const b of g.bodies.values()) { assert.ok(Math.abs(b.z) <= HD); }
});

for (const n of [1, 2, 4]) for (const seed of [1, 2, 3]) test(`${n} punching bot(s) clear level ${LEVELS[seed % LEVELS.length].id} inside the clock`, () => {
  const g = make(n, seed, 'easy');
  const ev = runBots(g);
  assert.ok(g.over, 'ended');
  assert.ok(g.debug.cleared, `cleared (wave ${g.debug.wi}, ${g.state().left}s left, failed ${g.debug.failed})`);
  assert.ok(ev.some(e => e.e === 'clear'));
  const r = checkResult(g, n);
  for (const pid of g.bodies.keys()) assert.ok(r.scores[pid] >= RULES.clearBonus, 'everyone gets the clear bonus');
  assert.ok(ev.filter(e => e.e === 'ko').length >= LEVELS[seed % LEVELS.length].waves.length);
});

test('the screen never scrolls back, stops at a wave, and the walls hold the players inside it', () => {
  const g = make(2, 1), [a, b] = [...g.bodies.keys()];
  let last = g.debug.win0, stopped = false;
  for (let i = 0; i < 200; i++) {
    tick(g, { [a]: { mx: 1, mz: 0, b: 0 }, [b]: { mx: -1, mz: 0, b: 0 } });
    const w0 = g.debug.win0; assert.ok(w0 >= last - 1e-9, 'never back'); last = w0;
    for (const body of g.bodies.values()) { assert.ok(body.x >= w0 - 0.01 && body.x <= w0 + W + 0.01, `inside the screen (${body.x} vs ${w0})`); }
    if (g.debug.waveOn) stopped = true;
  }
  assert.ok(stopped, 'a wave started');
  const at = g.debug.win0; for (let i = 0; i < 40; i++) tick(g, { [a]: { mx: 1, mz: 0, b: 0 } });
  assert.equal(g.debug.win0, at, 'locked during the wave');
  assert.equal(g.state().go, 0);
});

test('a three-punch combo: two jabs stagger, the third sends a roughneck flying; points for each hit', () => {
  const g = make(1, 1), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  for (let i = 0; i < 60 && !g.debug.foes.length; i++) tick(g, { [a]: { mx: 1, mz: 0, b: 0 } });
  for (let i = 0; i < 40; i++) tick(g);
  const e = g.debug.foes[0]; assert.ok(e, 'a roughneck came'); g.debug.foes.splice(1);
  e.hp = 99; e.cool = 99; e.x = A.x + 1; e.z = A.z; A.yaw = Math.PI / 2;
  const evs = [];
  for (let k = 0; k < 3; k++) { evs.push(...tick(g, { [a]: { mx: 0, mz: 0, b: IN.A } })); for (let j = 0; j < 9; j++) { e.x = A.x + 1; e.z = A.z; if (e.st === ST.stagger) e.st = ST.walk; evs.push(...tick(g)); } }
  const hits = evs.filter(x => x.e === 'hit' && x.id === e.id);
  assert.equal(hits.length, 3, 'three hits');
  assert.equal(hits[2].fin, 1);
  assert.equal(e.hp, 99 - 4);
  assert.equal(g.state().sc[a], 4 * RULES.ptsPerDmg);
});

test('jump kick: airborne, cannot be hurt, hits on the way, lands', () => {
  const g = make(1, 2), [a] = [...g.bodies.keys()], A = g.bodies.get(a);
  for (let i = 0; i < 80 && !g.debug.foes.length; i++) tick(g, { [a]: { mx: 1, mz: 0, b: 0 } });
  const e = g.debug.foes[0]; g.debug.foes.splice(1); A.x = g.debug.win0 + 4; e.cool = 99; e.x = A.x + 2; e.z = A.z; e.hp = 9; A.yaw = Math.PI / 2;
  const ev = tick(g, { [a]: { mx: 1, mz: 0, b: IN.B } });
  assert.ok(ev.some(x => x.e === 'kick'));
  assert.ok(A.flags & F.AIR);
  const ev2 = tick(g);
  assert.ok(A.y > 0.1, 'in the air');
  assert.equal(g.debug.P.get(a).kick > 0, true);
  for (let i = 0; i < 20; i++) ev2.push(...tick(g));
  assert.ok(ev2.some(x => x.e === 'hit' && x.id === e.id && x.fin === 1), 'kicked it');
  assert.equal(A.y, 0); assert.equal(A.flags & F.AIR, 0);
});

test('downed players get up when a friend stands by them; everyone down ends it', () => {
  const g = make(2, 1), [a, b] = [...g.bodies.keys()], A = g.bodies.get(a), B = g.bodies.get(b);
  const P = g.debug.P;
  P.get(a).hp = 1;
  // a roughneck swing that lands on a
  for (let i = 0; i < 80 && !g.debug.foes.length; i++) tick(g, { [a]: { mx: 1, mz: 0, b: 0 }, [b]: { mx: 1, mz: 0, b: 0 } });
  for (const e of g.debug.foes) e.cool = 99;
  B.x = A.x + 3; B.z = A.z;
  const e = g.debug.foes[0]; e.x = A.x + 1; e.z = A.z; e.st = ST.wind; e.t = 0.01; e.yaw = -Math.PI / 2;
  const ev = tick(g);
  assert.ok(ev.some(x => x.e === 'down' && x.pid === a), 'a is down');
  assert.ok(A.flags & F.FROZEN);
  assert.equal(g.state().hp[a], 0);
  B.x = A.x + 0.8; B.z = A.z;
  let ev2 = []; for (let i = 0; i < RULES.reviveT / DT + 3; i++) { for (const f of g.debug.foes) { f.cool = 99; f.st = ST.down; f.t = 5; } B.x = A.x + 0.8; B.z = A.z; ev2.push(...tick(g)); }
  assert.ok(ev2.some(x => x.e === 'up' && x.pid === a && x.by === b), 'b got a up');
  assert.equal(P.get(a).hp, RULES.reviveHp);
  assert.equal(g.state().sc[b], RULES.revivePts);
  // now both go down
  P.get(a).inv = 0; P.get(b).inv = 0;
  for (const pid of [a, b]) { P.get(pid).hp = 1; }
  g.debug.foes.length = 0;
  // fake two lethal hits through the boss charge path
  const hitAll = () => { for (const pid of [a, b]) { const s = P.get(pid); s.inv = 0; } };
  hitAll();
  const f = { id: 999, k: 'tough', def: FOES.tough, x: A.x, z: A.z, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, hp: 5, maxHp: 5, st: ST.windSlam, t: 0.01, cool: 0, poise: 0, dir: [1, 0], hitSet: new Set() };
  B.x = A.x + 1; g.debug.foes.push(f);
  const ev3 = []; for (let i = 0; i < 60 && !g.over; i++) ev3.push(...tick(g));
  assert.ok(ev3.some(x => x.e === 'fail'));
  assert.ok(g.over && g.debug.failed && !g.debug.cleared);
  checkResult(g, 2);
});

test('scores tie into one group; higher score first', () => {
  const g = make(3, 4), [a, b, c] = [...g.bodies.keys()], P = g.debug.P;
  P.get(a).score = 50; P.get(b).score = 50; P.get(c).score = 80;
  const r = checkResult(g, 3);
  assert.deepEqual(r.order, [[c], [a, b]]);
});

test('same seed, same inputs, same game', () => {
  const play = () => { const g = make(3, 9); runBots(g, 400); return JSON.stringify(g.state()); };
  assert.equal(play(), play());
});
