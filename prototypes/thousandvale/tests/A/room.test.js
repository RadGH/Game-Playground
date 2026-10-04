import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run } from './helpers.js';
import { createRoom, VIEW } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { decodeSnap } from '../../js/net/snapshot.js';
import { createMirror } from '../../js/net/mirror.js';

/** A bare room with a fake client recording frames. */
function bareRoom(createRules) {
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id: 'r', terrain, seed: 3, camps: [], createRules: createRules || (() => ({ addEntity(e) { e.setMax(100, 10); e.setHp(100); } })) });
  return room;
}
function fakeClient(room) {
  const c = { frames: [], json: [], mirror: createMirror(), send(d) { if (typeof d === 'string') { const m = JSON.parse(d); c.json.push(m); if (m.t === 'info') c.mirror.info(m.ents); } else { c.frames.push(d); c.mirror.snap(decodeSnap(d, room.q)); } } };
  return c;
}

test('view: entities beyond 150 m are never sent; walking away sends a leave', () => {
  const room = bareRoom();
  const c = fakeClient(room);
  const me = room.addPlayer({ id: 1, name: 'Me', level: 1, x: 500, z: 500, room: 'r' }, c);
  const near = room.spawn({ kind: 'monster', type: 'wolf', x: 520, z: 500 });
  const far = room.spawn({ kind: 'monster', type: 'wolf', x: 700, z: 500 });
  for (let i = 0; i < 4; i++) room.step();
  assert.ok(c.mirror.ents.has(near.id));
  assert.ok(!c.mirror.ents.has(far.id));
  assert.ok(c.mirror.ents.has(me.id));
  // near walks away to 800 m
  for (let i = 0; i < 40; i++) { near.moveTo(520 + i * 8, 500); room.step(); }
  assert.ok(!c.mirror.ents.has(near.id), 'left after walking away');
  // and far comes in
  for (let i = 0; i < 40; i++) { far.moveTo(700 - i * 5, 500); room.step(); }
  assert.ok(c.mirror.ents.has(far.id), 'entered when it came close');
  const fe = c.mirror.ents.get(far.id);
  assert.ok(Math.abs(fe.x - far.x) < 0.07, `mirror x ${fe.x} vs ${far.x}`);
  assert.equal(c.mirror.infos.get(far.id).type, 'wolf');
});

test('view: at most 150 entities, nearest cells first', () => {
  const room = bareRoom();
  const c = fakeClient(room);
  room.addPlayer({ id: 1, name: 'Me', level: 1, x: 1000, z: 1000, room: 'r' }, c);
  for (let i = 0; i < 400; i++) room.spawn({ kind: 'monster', type: 'wolf', x: 1000 + ((i * 37) % 200) - 100, z: 1000 + ((i * 53) % 200) - 100 });
  for (let i = 0; i < 25; i++) room.step();
  assert.ok(c.mirror.ents.size <= VIEW.cap + 40, 'size ' + c.mirror.ents.size);   // cap is per whole cells
  assert.ok(c.mirror.ents.size >= 100);
  let maxD = 0; for (const e of c.mirror.ents.values()) maxD = Math.max(maxD, Math.hypot(e.x - 1000, e.z - 1000));
  assert.ok(maxD < 120, 'kept the nearest, max d ' + maxD);
});

test('send rates: ~15 snapshots a second; idle entities cost nothing; a mover ~8 B per snapshot', () => {
  const room = bareRoom();
  const c = fakeClient(room);
  room.addPlayer({ id: 1, name: 'Me', level: 1, x: 500, z: 500, room: 'r' }, c);
  const idle = []; for (let i = 0; i < 20; i++) idle.push(room.spawn({ kind: 'monster', type: 'wolf', x: 505 + i, z: 505 }));
  const mover = room.spawn({ kind: 'monster', type: 'wolf', x: 510, z: 510 });
  for (let i = 0; i < 20; i++) room.step();    // settle (full records)
  c.frames.length = 0;
  for (let i = 0; i < 20; i++) { mover.moveTo(510 + (i % 2) * 0.5, 510 + (i % 3) * 0.5); room.step(); }
  assert.equal(c.frames.length, 15, 'frames in 1 s');
  const header = 13 + 16 + 0;                  // fixed header + my self block when moving (none: I'm idle)
  const avg = c.frames.reduce((a, f) => a + f.length, 0) / c.frames.length;
  assert.ok(avg <= 13 + 9, 'avg frame ' + avg + ' bytes');  // 13 header + one ~8 B mover record
  void header;
});

test('mid/far bands: 7.5 and 3 Hz', () => {
  const room = bareRoom();
  const c = fakeClient(room);
  room.addPlayer({ id: 1, name: 'Me', level: 1, x: 500, z: 500, room: 'r' }, c);
  const mid = room.spawn({ kind: 'monster', type: 'wolf', x: 570, z: 500 });
  const far = room.spawn({ kind: 'monster', type: 'wolf', x: 620, z: 500 });
  for (let i = 0; i < 20; i++) room.step();
  let midN = 0, farN = 0;
  for (let i = 0; i < 40; i++) {
    mid.moveTo(570 + (i % 2) * 0.3, 500); far.moveTo(620 + (i % 2) * 0.3, 500);
    const before = c.frames.length;
    room.step();
    for (const f of c.frames.slice(before)) { const s = decodeSnap(f, room.q); for (const r of s.ents) { if (r.id === mid.id) midN++; if (r.id === far.id) farN++; } }
  }
  assert.equal(midN, 15, 'mid band 7.5 Hz over 2 s');
  assert.equal(farN, 6, 'far band 3 Hz over 2 s');
});

test('a rules module that throws does not stop the tick', () => {
  let calls = 0;
  const room = bareRoom(() => ({ addEntity(e) { e.setMax(10); e.setHp(10); }, step() { calls++; throw new Error('boom'); }, intent() { throw new Error('bad'); } }));
  const c = fakeClient(room);
  const me = room.addPlayer({ id: 1, name: 'Me', level: 1, x: 500, z: 500, room: 'r' }, c);
  for (let i = 0; i < 10; i++) room.step();
  assert.equal(calls, 10);
  assert.equal(room.stats.rulesErrors, 10);
  assert.deepEqual(room.intent(me, { t: 'cast', slot: 0 }), { ok: false, why: 'unknown' });
  assert.ok(c.frames.length > 0);
});

test('two rooms never see each other\'s entities (room leak)', () => {
  const a = bareRoom(), b = bareRoom();
  const ca = fakeClient(a), cb = fakeClient(b);
  a.addPlayer({ id: 1, name: 'A', level: 1, x: 500, z: 500, room: 'r' }, ca);
  b.addPlayer({ id: 2, name: 'B', level: 1, x: 500, z: 500, room: 'r' }, cb);
  a.spawn({ kind: 'monster', type: 'wolf', x: 505, z: 500 });
  for (let i = 0; i < 5; i++) { a.step(); b.step(); }
  assert.equal(ca.mirror.ents.size, 2);
  assert.equal(cb.mirror.ents.size, 1);
});

test('speed hack: inputs claiming more time than passed are clamped to real time', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Speedy');
  const e = srv.world.room.entities.get(a.you);
  const x0 = e.x;
  let s = 0;
  // 2 seconds of real time, but 5 inputs of dt=100 every 50 ms (5x too many)
  for (let i = 0; i < 40; i++) { for (let k = 0; k < 2; k++) a.input({ s: ++s, dt: 100, mx: 1, mz: 0, yaw: 0, b: 0 }); await run(clock, 50); }
  const moved = e.x - x0;
  assert.ok(moved <= 5.4 * 2.6, `moved ${moved} m in 2 s (max ~${(5.4 * 2.5).toFixed(1)})`);
  // replayed old sequence numbers are ignored
  const x1 = e.x;
  for (let i = 0; i < 10; i++) a.input({ s: 1, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 });
  await run(clock, 200);
  assert.equal(e.x, x1);
  a.close(); await srv.stop();
});
