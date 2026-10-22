import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { F, DT } from '../js/shared/arena.js';
import { meta, create, RULES } from '../js/games/bumper-bash/sim.js';

const make = (n, seed = 3) => create({ seed, rng: makeRng(seed), players: Array.from({ length: n }, (_, i) => ({ pid: 60 + i, seat: i, name: 'P' + i })), difficulty: 'normal' });
function tick(g, inputs = {}) {
  for (const pid of g.bodies.keys()) g.input(pid, (typeof inputs === 'function' ? inputs(pid) : inputs[pid]) ?? { mx: 0, mz: 0, b: 0 });
  g.step(DT); return g.events.splice(0);
}
function checkResult(g, n) {
  const r = g.result(), all = r.order.flat();
  assert.equal(all.length, n); assert.deepEqual([...all].sort(), [...g.bodies.keys()].sort());
  assert.equal(r.unit, meta.unit); return r;
}
const toGo = g => { const ev = []; let i = 0; while (i++ < (RULES.countdown + 0.2) / DT) ev.push(...tick(g)); return ev; };
const set = (b, x, z, yaw, v = 0) => { b.x = x; b.z = z; b.yaw = yaw; b.vx = Math.sin(yaw) * v; b.vz = Math.cos(yaw) * v; };
// a bot that drives at the nearest other car
const chase = (g, pid) => {
  const me = g.bodies.get(pid); let t = null, bd = 99;
  for (const id of [...g.bodies.keys(), -1, -2, -3]) { const c = g.car(id); if (!c || id === pid) continue; const d = Math.hypot(c.b.x - me.x, c.b.z - me.z); if (d < bd) { bd = d; t = c.b; } }
  if (!t) return null; const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz) || 1; return { mx: dx / d, mz: dz / d, b: 0 };
};

for (const n of [1, 2, 3, 4]) test(`${n} player(s) chasing each other: bashes happen, never outside the rink, the clock ends it`, () => {
  const g = make(n, n); const ev = toGo(g); let i = 0;
  assert.ok(ev.some(e => e.e === 'count') && ev.some(e => e.e === 'go'));
  while (!g.over && i++ < (meta.seconds + 5) / DT) {
    ev.push(...tick(g, pid => chase(g, pid)));
    for (const b of g.bodies.values()) assert.ok(Math.abs(b.x) <= meta.arena.hw && Math.abs(b.z) <= meta.arena.hd);
  }
  assert.ok(g.over); assert.ok(i <= (meta.seconds + 2) / DT);
  assert.ok(ev.some(e => e.e === 'bash'), 'somebody got bashed');
  const r = checkResult(g, n);
  const best = Math.max(...Object.values(r.scores)); assert.ok(r.order[0].every(p => r.scores[p] === best));
});

test('nobody moves during the countdown', () => {
  const g = make(2), [a] = g.bodies.keys(), A = g.bodies.get(a), x = A.x;
  for (let i = 0; i < 2 / DT; i++) tick(g, { [a]: { mx: 1, mz: 0, b: 0 } });
  assert.equal(A.x, x);
});

for (const [zone, yaw, pts] of [['rear', Math.PI / 2, 3], ['side', 0, 2], ['front', -Math.PI / 2, 1]]) test(`a ${zone} hit scores ${pts} and spins the victim out (immune for a moment)`, () => {
  const g = make(3, 4), [a, b] = g.bodies.keys(); toGo(g);
  const A = g.bodies.get(a), B = g.bodies.get(b);
  set(A, -1.2, 3, Math.PI / 2, 6); set(B, 0, 3, yaw, 0);
  const ev = tick(g, { [a]: { mx: 1, mz: 0, b: 0 } });
  const bash = ev.find(e => e.e === 'bash'); assert.ok(bash, 'bashed');
  assert.equal(bash.by, a); assert.equal(bash.id, b); assert.equal(bash.zone, zone); assert.equal(g.state().sc[a], pts);
  assert.ok(B.flags & F.STUN, 'spinning'); assert.ok(B.vx > 3, 'shoved away');
  set(A, B.x - 1.2, B.z, Math.PI / 2, 6);
  for (let k = 0; k < 14; k++) tick(g, { [a]: { mx: 1, mz: 0, b: 0 } });
  assert.equal(g.state().sc[a], pts, 'no double-dip on a spinning car');
});

test('stars score, bolts give a turbo that adds +1 to a hit; rubber walls bounce', () => {
  const g = make(2, 6), [a, b] = g.bodies.keys(); toGo(g); let i = 0;
  while (g.picks.length < 2 && i++ < 400) tick(g);
  assert.equal(g.picks.length, 2);
  const A = g.bodies.get(a); let star = g.picks.find(p => p.kind === 'star'), zap = g.picks.find(p => p.kind === 'zap');
  if (star) { set(A, star.x, star.z, 0); const ev = tick(g); assert.ok(ev.some(e => e.e === 'pick' && e.kind === 'star')); assert.equal(g.state().sc[a], RULES.star); }
  if (!zap) { g.picks.push({ id: 99, x: 3, z: 3, kind: 'zap' }); zap = g.picks[g.picks.length - 1]; }
  const before = g.state().sc[a];
  set(A, zap.x, zap.z, 0); tick(g); assert.ok(A.flags & F.BOOST, 'turbo');
  const B = g.bodies.get(b); set(A, -1.2, -3, Math.PI / 2, 6); set(B, 0, -3, Math.PI / 2, 0);
  const ev = tick(g, { [a]: { mx: 1, mz: 0, b: 0 } }); const bash = ev.find(e => e.e === 'bash');
  assert.equal(bash.pts, RULES.pts.rear + RULES.pts.turbo); assert.equal(g.state().sc[a], before + bash.pts);
  // wall bounce
  set(A, meta.arena.hw - 0.6, 0, Math.PI / 2, 6); A.flags &= ~F.STUN;
  const ev2 = tick(g, { [a]: { mx: 1, mz: 0, b: 0 } }); assert.ok(A.vx < 0, `bounced back (${A.vx})`); assert.ok(ev2.some(e => e.e === 'boing'));
});

test('solo: three target cars drift about and can be bashed for points; targets never score', () => {
  const g = make(1, 5), [a] = g.bodies.keys(); const ev = toGo(g); let i = 0;
  assert.equal(g.state().tg.length, 3);
  const t0 = g.state().tg.map(r => r[1] + ',' + r[2]).join();
  while (!g.over && i++ < (meta.seconds + 5) / DT) ev.push(...tick(g, pid => chase(g, pid)));
  assert.notEqual(g.state().tg.map(r => r[1] + ',' + r[2]).join(), t0, 'targets moved');
  const bashes = ev.filter(e => e.e === 'bash'); assert.ok(bashes.length >= 3, `${bashes.length} bashes`);
  assert.ok(bashes.every(e => e.by === a));
  assert.equal(checkResult(g, 1).scores[a] >= bashes.reduce((s, e) => s + e.pts, 0), true);
});

test('equal scores tie; same seed same match', () => {
  const g = make(4, 2); toGo(g); while (!g.over) tick(g);
  const r = checkResult(g, 4); assert.equal(r.order.length, 1, 'nobody moved: one shared place');
  const run = () => { const g2 = make(3, 8); const ev = []; let i = 0; while (!g2.over && i++ < 3000) ev.push(...tick(g2, pid => chase(g2, pid))); return JSON.stringify(ev); };
  assert.equal(run(), run());
});
