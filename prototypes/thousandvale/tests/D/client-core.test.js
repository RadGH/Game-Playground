// Stream D — node tests for the pure parts of the client: protocol adapter, prediction + reconcile,
// interpolation + server clock, the heightfield's agreement with the drawn triangles, and the stand-in
// server (two connections see each other; a wolf can be killed for shared credit).
// Run: node --test prototypes/thousandvale/tests/D/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../js/client/protocol.js';
import { Predictor, stepMove, MOVE } from '../../js/client/predict.js';
import { SnapshotBuffer, ServerClock, angleDelta } from '../../js/client/interp.js';
import { createHeightField } from '../../js/client/heightfield.js';
import { standinTerrain } from '../../js/client/dev/standin-terrain.js';
import { createStandinServer } from '../../js/client/dev/standin-sim.js';

const flat = () => 0;

test('protocol: decode never lets NaN or junk through', () => {
  const s = P.decode({ t: 'snap', tick: 'x', time: 5, ack: 3, you: { x: 'NaN', y: 1, z: 2 }, ents: [{ id: 4, x: null, y: undefined, z: 'abc', yaw: 1 }] });
  assert.equal(s.type, 'snap');
  assert.equal(s.tick, 0);
  assert.equal(s.you.x, 0);
  for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(s.ents[0][k]));
  assert.equal(P.decode(null).type, 'unknown');
  assert.equal(P.decode({ t: 'from-the-future' }).type, 'unknown');
  const sp = P.decode({ t: 'spawn', ent: { id: 1, kind: 'player', hpMax: 'lots' } });
  assert.equal(sp.ents.length, 1);
  assert.equal(sp.ents[0].hpMax, 100);
});

test('protocol: names are cleaned, inputs are quantised', () => {
  assert.equal(P.cleanName('  <b>Al dra</b>!!  '), 'bAl drab');
  assert.equal(P.cleanName('x'), '');
  assert.equal(P.cleanName("O'Brien-Smythe the Long"), "O'Brien-Smythe t");
  const i = P.encodeInput(7, 0.123456, -1, 3.14159265, true);
  assert.deepEqual(i, { t: 'input', seq: 7, mx: 0.123, mz: -1, yaw: 3.142, run: 1 });
  assert.equal(P.encodeChat('say', 'x'.repeat(999)).text.length, 240);
});

test('predict: stepMove speed, diagonal clamp, backpedal', () => {
  const s = stepMove({ x: 0, y: 0, z: 0 }, { mx: 0, mz: 1, yaw: 0, run: 1 }, 1, flat);
  assert.ok(Math.abs(s.z - MOVE.run) < 1e-9);
  const d = stepMove({ x: 0, y: 0, z: 0 }, { mx: 1, mz: 1, yaw: Math.PI / 4, run: 1 }, 1, flat);
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - MOVE.run) < 1e-9, 'diagonal is not faster');
  const b = stepMove({ x: 0, y: 0, z: 0 }, { mx: 0, mz: -1, yaw: 0, run: 1 }, 1, flat);
  assert.ok(Math.abs(b.z + MOVE.run * MOVE.backMul) < 1e-9, 'backpedal is slower');
  const w = stepMove({ x: 0, y: 0, z: 0 }, { mx: 0, mz: 1, yaw: 0, run: 0 }, 1, flat);
  assert.ok(Math.abs(w.z - MOVE.walk) < 1e-9);
});

test('predict: reconcile with an agreeing server changes nothing; a disagreeing one blends', () => {
  const p = new Predictor({ heightAt: flat, stepSec: 0.05 });
  p.reset({ x: 0, y: 0, z: 0 });
  // Simulate a server that applies the same steps, 3 steps behind.
  const server = [];
  let srv = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 20; i++) {
    const st = p.apply({ mx: 0, mz: 1, yaw: 0, run: 1 });
    server.push(st);
    if (i >= 3) { const s = server.shift(); srv = stepMove(srv, s, 0.05, flat); assert.ok(p.reconcile(s.seq, srv) < 1e-9); }
  }
  assert.equal(p.corrections, 0);
  // Now the server says we were stopped by something 0.5 m short.
  const last = p.pending[0].seq - 1;
  const before = p.render(1, 0);
  const d = p.reconcile(last, { x: 0, y: 0, z: srv.z - 0.5 });
  assert.ok(d > 0.4 && d < 0.6);
  const now = p.render(1, 0);
  assert.ok(Math.abs(now.z - before.z) < 1e-6, 'the drawn position does not jump on a small correction');
  for (let i = 0; i < 60; i++) p.render(1, 1 / 60);
  assert.ok(Math.abs(p.render(1, 0).z - p.pos.z) < 0.01, 'and the error blends away within a second');
  // A huge correction (teleport) snaps.
  p.reconcile(last + 1000, { x: 100, y: 0, z: 100 });
  assert.equal(p.render(1, 0).x, 100);
});

test('interp: samples between snapshots, extrapolates briefly, wraps angles', () => {
  const b = new SnapshotBuffer();
  b.push({ t: 100, x: 0, y: 0, z: 0, yaw: 3.0 });
  b.push({ t: 200, x: 10, y: 0, z: 0, yaw: -3.0 });
  b.push({ t: 150, x: 5, y: 0, z: 0, yaw: Math.PI });   // out of order arrival
  assert.equal(b.s.map(s => s.t).join(), '100,150,200');
  const m = b.sample(125);
  assert.ok(Math.abs(m.x - 2.5) < 1e-9);
  const e = b.sample(250);
  assert.ok(e.extrapolated && Math.abs(e.x - 15) < 1e-9);
  const far = b.sample(10000);
  assert.ok(far.x <= 10 + 10 * (250 / 50) + 1e-9, 'extrapolation is capped at 250 ms');
  assert.ok(Math.abs(angleDelta(3.0, -3.0) - (2 * Math.PI - 6)) < 1e-9);
  assert.ok(b.speedAt(190) > 90);
});

test('clock: converges on the server offset from pings', () => {
  let local = 1000;
  const c = new ServerClock(() => local);
  const offset = 50000;
  for (let i = 0; i < 10; i++) {
    const sent = local; local += 20;           // 40 ms rtt, symmetric
    const s = sent + 20 + offset; local += 20;
    c.pong(sent, s);
    local += 2000;
  }
  for (let i = 0; i < 80; i++) c.time();
  assert.ok(Math.abs(c.time() - (local + offset)) < 3, `clock off by ${c.time() - (local + offset)}`);
  assert.ok(Math.abs(c.rtt - 40) < 1e-6);
});

test('heightfield: heightAt lies exactly on the drawn triangles (same diagonal)', () => {
  const res = 5, size = 8, data = new Float32Array(res * res);
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 1.7) * 3;
  const hf = createHeightField({ size, res, data });
  // At every vertex: exact.
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = -4 + i * 2, z = -4 + j * 2;
    if (i < res - 1 && j < res - 1) assert.ok(Math.abs(hf.heightAt(x, z) - data[j * res + i]) < 1e-5);
  }
  // On the shared diagonal between (i, j+1) and (i+1, j): both triangles give the same value.
  const x = -4 + 0.5 * 2, z = -4 + 0.5 * 2;   // middle of cell (0,0), on the diagonal
  const h = hf.heightAt(x, z);
  const mid = (data[1 * res + 0] + data[0 * res + 1]) / 2;
  assert.ok(Math.abs(h - mid) < 1e-5, 'midpoint of the diagonal is the mean of its ends, not the bilinear mean');
  const n = hf.normalAt(1, 1);
  assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9);
});

test('stand-in terrain: spawn clearing is dry and level', () => {
  const t = standinTerrain(7);
  assert.ok(t.heightAt(0, 6) > t.waterLevel + 1);
  assert.ok(t.slopeAt(0, 6) < 0.05);
  assert.ok(t.heightAt(-16, 58) > t.waterLevel + 0.5, 'the nearest wolves stand on land');
});

test('stand-in server: two players see each other move and share credit for a wolf', () => {
  let now = 0;
  const srv = createStandinServer({ seed: 7, now: () => now });
  const inbox = { a: [], b: [] };
  const A = srv.connect(m => inbox.a.push(m)), B = srv.connect(m => inbox.b.push(m));
  for (const [c, name] of [[A, 'Aldra'], [B, 'Bren']]) { c.receive(P.encodeHello()); c.receive(P.encodeGuest(name, { race: 'elf', cls: 'ranger' })); }
  const idA = inbox.a.find(m => m.t === 'welcome').you.id, idB = inbox.b.find(m => m.t === 'welcome').you.id;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { now += 50; srv.step(); } };
  tick(2);
  assert.ok(inbox.a.some(m => m.t === 'spawn' && m.ents.some(e => e.id === idB)), 'A was told about B');
  // B walks north for a second; A's snapshots show B moving.
  const zAt = () => inbox.a.filter(m => m.t === 'snap').map(m => m.ents.find(e => e.id === idB)).filter(Boolean).pop().z;
  const z0 = zAt();
  for (let i = 1; i <= 20; i++) { B.receive(P.encodeInput(i, 0, 1, 0, 1)); tick(); }
  assert.ok(zAt() - z0 > 5, `B moved ${zAt() - z0} m in A's view`);
  // Both walk to the nearest wolf and hit it until it dies.
  const wolf = [...srv.monsters.values()].sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
  const pa = srv.players.get(idA), pb = srv.players.get(idB);
  let seqA = 100, seqB = 100;
  for (let i = 0; i < 400 && wolf.hp > 0; i++) {
    for (const [c, p, s] of [[A, pa, 'a'], [B, pb, 'b']]) {
      const dx = wolf.x - p.x, dz = wolf.z - p.z, d = Math.hypot(dx, dz);
      const seq = s === 'a' ? ++seqA : ++seqB;
      if (d > 2.5) c.receive(P.encodeInput(seq, dx / d, dz / d, Math.atan2(dx, dz), 1));
      else c.receive(P.encodeCast(0, wolf.id, { x: wolf.x, z: wolf.z }, now));
    }
    tick();
  }
  tick(10);
  assert.equal(wolf.hp, 0, 'the wolf died');
  assert.ok(inbox.a.some(m => m.t === 'death' && m.id === wolf.id) && inbox.b.some(m => m.t === 'death' && m.id === wolf.id));
  assert.ok(inbox.a.some(m => m.t === 'xp' && m.amount > 0) && inbox.b.some(m => m.t === 'xp' && m.amount > 0), 'both got credit');
  // Every snapshot acked an input the client really sent.
  assert.ok(inbox.b.filter(m => m.t === 'snap').every(m => m.ack <= seqB));
});

test('stand-in server: refuses a wrong protocol version and an unknown token', () => {
  const srv = createStandinServer({ seed: 7, now: () => 0 });
  const out = [];
  const c = srv.connect(m => out.push(m));
  c.receive({ t: 'hello', v: 999 });
  assert.equal(out.pop().reason, 'version');
  c.receive(P.encodeHello());
  c.receive(P.encodeResume('nope'));
  assert.equal(out.pop().reason, 'token');
});
