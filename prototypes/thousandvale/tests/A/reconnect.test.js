import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { connect, memoryTokenStore } from '../../js/net/client.js';
import { makeServer, makeClient, joinAs, run, until, waitP } from './helpers.js';
import { ent as entOf_, roomOf as roomOf_ } from './helpers.js';

test('crash (kill -9 style) + restart: the client reconnects by itself and resumes from the last save', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  let srv = makeServer({ clock, store, worldOpts: { saveEveryMs: 1000 } });
  await srv.ready;
  const a = makeClient(() => srv, clock);
  let joins = 0; a.on('joined', () => joins++);
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Phoenix', cls: 'warrior' }));
  a.play(ch.id);
  await until(clock, () => a.status === 'online');
  let s = 0;
  for (let i = 0; i < 40; i++) { a.input({ s: ++s, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await run(clock, 50); }
  await run(clock, 1500);                                  // a save happens (every 1 s while moving)
  const saved = Object.values(store.data.chars)[0];
  assert.ok(saved.version >= 1, 'saved at least once');
  const savedX = saved.cols.x;
  assert.ok(saved.lease_owner, 'lease held while online');
  srv.crash();                                             // no saves, no goodbyes
  await run(clock, 300);
  assert.equal(a.status, 'reconnecting');
  srv = makeServer({ clock, store, worldOpts: { saveEveryMs: 1000 } });   // restart on the same store
  await srv.ready;
  const ok = await until(clock, () => a.status === 'online' && joins === 2, 15000);
  assert.ok(ok, 'reconnected; status ' + a.status);
  const e = entOf_(srv, a);
  assert.ok(Math.abs(e.x - savedX) < 0.01, `resumed at the saved x ${savedX}, got ${e.x}`);
  a.close(); await srv.stop();
});

test('the same character logging in from a second tab takes over; the first is told why and stays off', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { lingerMs: 5000 } });
  await srv.ready;
  const tok = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Twin', 'warrior', { tokenStore: tok });
  const charId = a.joined.you.char;
  const b = makeClient(srv, clock, { tokenStore: memoryTokenStore(tok.get()) });
  await waitP(clock, b.ready);
  b.play(charId);
  await until(clock, () => b.status === 'online');
  await run(clock, 3000);
  assert.equal(a.status, 'kicked'); assert.equal(a.lastKick.code, 'elsewhere');
  assert.equal(b.status, 'online');
  assert.equal(b.you, a.you, 'same entity taken over');
  assert.equal([...srv.world.rooms.values()].reduce((n, r) => n + [...r.entities.values()].filter(e => e.kind === 'player').length, 0), 1);
  b.close(); await srv.stop();
});

test('a dropped connection lingers a few seconds; reconnecting inside that keeps the same entity', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { lingerMs: 5000 } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Flaky');
  const id = a.you;
  // drop just the sockets (network blip): close them from the server side
  const g = [...srv.world.online.values()][0];
  g.conn.closeSoon('blip');
  await until(clock, () => a.status === 'online' && a.you, 8000);
  assert.equal(a.status, 'online');
  assert.equal(a.you, id, 'same entity');
  a.close(); await srv.stop();
});

test('a bad stored token silently becomes a new guest', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const tok = memoryTokenStore('f'.repeat(64));
  const a = makeClient(srv, clock, { tokenStore: tok });
  let ready = false; a.ready.then(() => { ready = true; });
  await until(clock, () => ready);
  assert.ok(tok.get() && tok.get() !== 'f'.repeat(64));
  a.close(); await srv.stop();
});

test('logout saves and releases the lease; the next login resumes the position', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store });
  await srv.ready;
  const tok = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Walker', 'warrior', { tokenStore: tok });
  let s = 0;
  for (let i = 0; i < 20; i++) { a.input({ s: ++s, dt: 50, mx: 0, mz: 1, yaw: 0, b: 0 }); await run(clock, 50); }
  await run(clock, 100);
  const z = entOf_(srv, a).z;
  a.leave();
  await run(clock, 500);
  const row = Object.values(store.data.chars)[0];
  assert.equal(row.lease_owner, null);
  assert.ok(Math.abs(row.cols.z - z) < 1e-9);
  const b = makeClient(srv, clock, { tokenStore: tok });
  await waitP(clock, b.ready);
  b.play(row.id);
  await until(clock, () => b.status === 'online');
  assert.ok(Math.abs(entOf_(srv, b).z - z) < 1e-9);
  b.close(); await srv.stop();
});
