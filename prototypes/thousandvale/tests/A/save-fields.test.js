import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_FIELDS, packChar, unpackChar, unknownKeys } from '../../js/sim/save-fields.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';

test('every SAVE_FIELDS entry survives a pack/unpack round trip at an odd value', () => {
  const ch = { id: 9, account: 2, version: 3 };
  SAVE_FIELDS.forEach((f, i) => { ch[f.k] = typeof f.def === 'number' ? 1000 + i + 0.25 : f.k === 'look' ? { race: 'dwarf', hair: i } : 'odd-' + f.k; });
  const back = unpackChar({ id: 9, account: 2, version: 3, ...packChar(ch) });
  assert.deepEqual(back, ch);
});

test('a character that went through the world carries no field SAVE_FIELDS misses', async () => {
  const { makeServer, joinAs, run } = await import('./helpers.js');
  const { createVirtualClock } = await import('../../js/net/clock.js');
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Keeper');
  await run(clock, 200);
  const o = srv.world.online.get([...srv.world.online.keys()][0]);
  await srv.world.saveNow(o);
  assert.deepEqual(unknownKeys(o.char), []);
  a.close(); await srv.stop();
});

test('memory store: version + fence refuse a stale writer; leases block a second taker', async () => {
  let t = 0;
  const st = createMemoryStore({ now: () => t });
  const { account } = await st.createGuest();
  const { char } = await st.createChar(account, { name: 'Lease', cls: 'warrior' });
  const a = await st.takeChar(account, char.id, 'p0:a', 30000);
  assert.ok(a.char);
  assert.equal((await st.takeChar(account, char.id, 'p1:b', 30000)).err, 'lease');
  a.char.x = 5;
  assert.equal(await st.saveChar(a.char, a.fence), true);
  t += 31000;                                         // lease ran out: another process takes it
  const b = await st.takeChar(account, char.id, 'p1:b', 30000);
  assert.ok(b.char && b.fence > a.fence);
  a.char.x = 99;                                       // the frozen first holder wakes up and saves
  assert.equal(await st.saveChar(a.char, a.fence), false, 'fenced out');
  assert.equal(await st.saveChar(b.char, b.fence), true);
  assert.equal((await st.takeChar(account, 999, 'p1:b')).err, 'missing');
  assert.equal(await st.clearLeases('p1:'), 1);
  assert.equal((await st.createChar(account, { name: 'lease', cls: 'warrior' })).err, 'name', 'names are unique ignoring case');
  assert.equal(await st.authToken('nope'), null);
});
