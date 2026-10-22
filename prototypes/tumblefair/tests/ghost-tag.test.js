import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT, stepBody } from '../js/shared/arena.js';
import { IN } from '../js/shared/protocol.js';
import { meta, create, RULES, makeLayout } from '../js/games/ghost-tag/sim.js';
import { eligible } from '../js/games/index.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 40 + i, seat: i, name: 'P' + i })), difficulty: 'normal', season: 'halloween' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, inputs[pid] ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
const run = (g, s, inputs) => { const ev = []; for (let i = 0; i < s / DT && !g.over; i++) ev.push(...tick(g, typeof inputs === 'function' ? inputs(i) : inputs)); return ev; };
const untilPlay = g => { const ev = []; while (g.phase !== 'play' && !g.over) ev.push(...tick(g)); return ev; };
const place = (b, x, z) => { b.x = x; b.z = z; b.vx = b.vz = 0; };
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  const flat = r.order.map(grp => grp.map(pid => r.scores[pid]));
  for (const grp of flat) assert.equal(new Set(grp).size, 1);
  for (let i = 1; i < flat.length; i++) assert.ok(flat[i - 1][0] > flat[i][0]);
  return r;
}

test('it is a Halloween holiday game: offered only in season', () => {
  assert.equal(meta.season, 'halloween'); assert.ok(meta.tags.includes('holiday'));
  assert.ok(eligible(3, [], 'halloween').includes(meta.id)); assert.ok(!eligible(3, [], null).includes(meta.id));
});

test('the patch is mirrored left-right, keeps the middle and the spawn ring clear, and comes from the seed', () => {
  for (let seed = 1; seed < 30; seed++) {
    const L = makeLayout(makeRng(seed)), L2 = makeLayout(makeRng(seed));
    assert.deepEqual(L, L2);
    assert.ok(L.blocks.length >= 2 && L.posts.length >= 3, `seed ${seed}: something to hide behind`);
    for (const b of L.blocks) assert.ok(L.blocks.some(c => c.x === -b.x && c.z === b.z), 'mirrored block');
    for (const p of L.posts.slice(0, -1)) assert.ok(L.posts.some(c => c.x === -p.x && c.z === p.z && c.r === p.r), 'mirrored pumpkin');
    for (const o of [...L.blocks, ...L.posts]) assert.ok(Math.hypot(o.x, o.z) > 2.2, 'centre clear (the ghost starts there)');
  }
});

for (const n of [2, 3, 4]) test(`${n} players: ${n} rounds, everyone starts as the ghost exactly once, the game ends in time`, () => {
  const g = make(n, 10 + n); const ev = []; let steps = 0;
  while (!g.over) { ev.push(...tick(g)); steps++; assert.ok(steps < meta.seconds / DT + 2, 'ends by itself'); }
  const rounds = ev.filter(e => e.e === 'round');
  assert.equal(rounds.length, n);
  assert.deepEqual(rounds.map(r => r.ghost).sort(), [...g.bodies.keys()].sort(), 'each player is the first ghost once');
  assert.deepEqual(g.init().order.slice().sort(), [...g.bodies.keys()].sort());
  checkResult(g, n);
});

test('two players standing still: the human survives every round, so it is a fair tie', () => {
  const g = make(2, 5);
  while (!g.over) tick(g);
  const r = checkResult(g, 2);
  assert.equal(r.order.length, 1, 'one shared place');
  const [v] = Object.values(r.scores); assert.ok(Math.abs(v - (RULES.roundTime[2] + RULES.lastPts)) <= 1, `one round of survival seconds + last-human bonus (${v})`);
});

test('the first ghost floats, is faster, and counts before it can move or tag', () => {
  const g = make(3); untilPlay(g);
  const gid = g.firstGhostOf(1), G = g.bodies.get(gid), hid = [...g.bodies.keys()].find(p => p !== gid), H = g.bodies.get(hid);
  assert.ok(G.flags & F.BOOST, 'ghosts are boosted'); assert.ok(G.y > 0.2, 'and float'); assert.equal(H.flags & F.BOOST, 0); assert.equal(H.y, 0);
  assert.ok(G.flags & F.FROZEN, 'counting');
  place(H, G.x + 0.5, G.z);
  const ev = tick(g); assert.ok(!ev.some(e => e.e === 'tag'), 'cannot tag while counting');
  assert.equal(g.state().ro[gid], 2);
  place(H, 6, 4);
  run(g, RULES.count);
  assert.equal(G.flags & F.FROZEN, 0, 'free to chase'); assert.equal(g.state().ro[gid], 1);
  // the boosted ghost really outruns a human
  const a = { x: 0, z: 0, y: 0, vx: 0, vz: 0, yaw: 0, flags: F.BOOST }, b = { x: 0, z: 0, y: 0, vx: 0, vz: 0, yaw: 0, flags: 0 };
  for (let i = 0; i < 20; i++) { stepBody(a, { mx: 1, mz: 0 }, meta.move, null); stepBody(b, { mx: 1, mz: 0 }, meta.move, null); }
  assert.ok(a.x > b.x * 1.1);
});

test('a touch turns a human into a ghost (+3 to the tagger); the new ghost rises before it can tag; last one tagged gets +5', () => {
  const g = make(3, 4); untilPlay(g); run(g, RULES.count + 0.1);
  const gid = g.firstGhostOf(1), [h1, h2] = [...g.bodies.keys()].filter(p => p !== gid), G = g.bodies.get(gid), H1 = g.bodies.get(h1), H2 = g.bodies.get(h2);
  place(G, 0, 0); place(H1, 0.6, 0); place(H2, -6, 3);
  const ev = tick(g);
  assert.ok(ev.some(e => e.e === 'tag' && e.pid === h1 && e.by === gid));
  assert.equal(g.stats(gid).tags, 1); assert.equal(g.state().ro[h1], 2, 'rising');
  assert.ok(H1.flags & F.BOOST);
  // the risen ghost cannot tag straight away
  place(H2, H1.x + 0.5, H1.z); place(G, 6, -4);
  const ev2 = tick(g); assert.ok(!ev2.some(e => e.e === 'tag' && e.pid === h2), 'still rising');
  place(H2, -6, 3); run(g, RULES.rise + 0.05);
  place(H1, 0, 0); place(H2, 0.5, 0);
  const ev3 = run(g, 0.2);
  assert.ok(ev3.some(e => e.e === 'tag' && e.pid === h2 && e.by === h1));
  const end = ev3.find(e => e.e === 'roundEnd'); assert.ok(end, 'no humans left: the round is over'); assert.equal(end.why, 'all'); assert.deepEqual(end.last, [h2]);
  const st = g.stats(h2), stG = g.stats(gid), st1 = g.stats(h1);
  assert.equal(stG.pts, RULES.tagPts + 0, 'the first ghost: one tag, no survival time');
  assert.ok(st1.pts >= RULES.tagPts, 'the second ghost: its tag + the seconds it survived');
  assert.ok(st.pts >= RULES.lastPts, 'last human: +5 + seconds');
  assert.ok(st.lastHuman === 1);
});

test('A: a ghost\'s BOO! makes nearby humans stumble; a human\'s A is a quick dash', () => {
  const g = make(2, 8); untilPlay(g); run(g, RULES.count + 0.1);
  const gid = g.firstGhostOf(1), hid = [...g.bodies.keys()].find(p => p !== gid), G = g.bodies.get(gid), H = g.bodies.get(hid);
  place(G, 0, 0); place(H, 1.8, 0);
  const ev = tick(g, { [gid]: { mx: 0, mz: 0, b: IN.A } });
  assert.ok(ev.some(e => e.e === 'boo' && e.pid === gid)); assert.ok(H.flags & F.STUN);
  const ev2 = run(g, RULES.booCool - 0.5, i => ({ [gid]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } })); assert.ok(!ev2.some(e => e.e === 'boo'), 'cooldown');
  run(g, 1); place(H, 0, 4); H.yaw = Math.PI / 2; const x0 = H.x;
  const ev3 = run(g, 0.3, i => ({ [hid]: { mx: 0, mz: 0, b: i === 0 ? IN.A : 0 } }));
  assert.ok(!ev3.some(e => e.e === 'boo')); assert.ok(ev3.some(e => e.e === 'dash' && e.pid === hid));
  assert.ok(H.x - x0 > 1.2, `dashed forward (${(H.x - x0).toFixed(2)} m standing still)`);
  const ev4 = run(g, 0.5, i => ({ [hid]: { mx: 0, mz: 0, b: i % 2 ? IN.A : 0 } })); assert.ok(!ev4.some(e => e.e === 'dash'), 'dash cooldown');
});

test('a chase game with bots: ghosts chase, humans flee, scores are tags and seconds, order best first', () => {
  for (const n of [2, 3, 4]) {
    const g = make(n, 20 + n); let i = 0, tags = 0;
    while (!g.over) {
      const st = g.state(), inp = {};
      for (const [pid, b] of g.bodies) {
        let best = null, bd = 1e9;
        for (const [q, c] of g.bodies) if (q !== pid && (st.ro[q] > 0) !== (st.ro[pid] > 0)) { const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < bd) { bd = d; best = c; } }
        if (!best) { inp[pid] = { mx: 0, mz: 0, b: 0 }; continue; }
        const dx = best.x - b.x, dz = best.z - b.z, m = Math.hypot(dx, dz) || 1, s = st.ro[pid] > 0 ? 1 : -1;
        inp[pid] = { mx: s * dx / m + (s < 0 ? Math.sin(i * 0.05 + pid) * 0.6 : 0), mz: s * dz / m + (s < 0 ? Math.cos(i * 0.05 + pid) * 0.6 : 0), b: s > 0 && bd < 2 && i % 10 === 0 ? IN.A : 0 };
      }
      tags += tick(g, inp).filter(e => e.e === 'tag').length; i++;
      for (const b of g.bodies.values()) assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd);
    }
    assert.ok(tags >= 1, `${n} players: somebody got tagged`);
    const r = checkResult(g, n);
    const total = [...g.bodies.keys()].reduce((s, pid) => s + g.stats(pid).tags, 0); assert.equal(total, tags);
    assert.equal(r.unit, 'pts');
  }
});

test('solo: CPU ghosts drift in and catch you; three lanterns, then it ends; score = seconds survived', () => {
  const g = make(1, 2), [me] = [...g.bodies.keys()];
  const ev = []; while (!g.over) ev.push(...tick(g));
  const cpu = ev.filter(e => e.e === 'cpu'), caught = ev.filter(e => e.e === 'caught');
  assert.ok(cpu.length >= 1); assert.equal(caught.length, RULES.solo.lives);
  assert.deepEqual(caught.map(c => c.lives), [2, 1, 0]);
  const r = g.result(); assert.deepEqual(r.order, [[me]]); assert.equal(r.unit, 's');
  assert.equal(r.scores[me], Math.floor(g.stats(me).survived));
  assert.ok(g.state().cpu.length >= 1);
});

test('solo: running away survives longer than standing still', () => {
  const idle = make(1, 6); while (!idle.over) tick(idle);
  const g = make(1, 6), [me] = [...g.bodies.keys()]; let i = 0;
  while (!g.over) {
    const b = g.bodies.get(me); let fx = 0, fz = 0;
    for (const c of g.cpus) { const dx = b.x - c.body.x, dz = b.z - c.body.z, d = Math.hypot(dx, dz) || 1; fx += dx / d / d; fz += dz / d / d; }
    fx += -b.x * 0.05; fz += -b.z * 0.05; fx += Math.sin(i * 0.04) * 0.15;                     // keep off the walls, keep moving
    const m = Math.hypot(fx, fz) || 1; tick(g, { [me]: { mx: fx / m, mz: fz / m, b: 0 } }); i++;
  }
  assert.ok(g.result().scores[me] > idle.result().scores[me], `${g.result().scores[me]} s running vs ${idle.result().scores[me]} s standing`);
});

test('same seed, same inputs: same game', () => {
  const play = () => { const g = make(4, 12); let i = 0; while (!g.over) { const inp = {}; for (const pid of g.bodies.keys()) inp[pid] = { mx: Math.sin(i * 0.03 + pid), mz: Math.cos(i * 0.05 + pid), b: i % 13 === 0 ? IN.A : 0 }; tick(g, inp); i++; } return JSON.stringify(g.result()); };
  assert.equal(play(), play());
});
