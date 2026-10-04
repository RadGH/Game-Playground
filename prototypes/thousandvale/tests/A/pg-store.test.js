// The Postgres store obeys the same rules as the memory store (leases, fencing, versions, unique names).
// Skipped unless the PG* environment is set (source ~/.config/thousandvale/dev.env). Cleans up after itself.
import test from 'node:test';
import assert from 'node:assert/strict';

const HAVE_PG = !!(process.env.PGDATABASE || process.env.DATABASE_URL);

test('pg store: guest, characters, leases, fencing, versions', { skip: !HAVE_PG && 'no PG* environment' }, async () => {
  const { createPgStore } = await import('../../server/db/pg-store.js');
  const st = createPgStore();
  await st.init();
  const made = [];
  try {
    const g = await st.createGuest('Tester');
    made.push(g.account);
    assert.equal(g.token.length, 64);
    const a = await st.authToken(g.token);
    assert.equal(a.account, g.account);
    assert.equal(await st.authToken('0'.repeat(64)), null);
    const nm = 'Pgtest ' + Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
    const { char } = await st.createChar(g.account, { name: nm, cls: 'mage', look: { race: 'elf' } });
    assert.equal(char.name, nm); assert.equal(char.level, 1);
    assert.equal((await st.createChar(g.account, { name: nm.toUpperCase(), cls: 'mage' })).err, 'name');
    assert.equal((await st.listChars(g.account)).length, 1);
    const t1 = await st.takeChar(g.account, char.id, 'ptest:a', 30000);
    assert.equal(t1.char.look.race, 'elf');
    assert.equal((await st.takeChar(g.account, char.id, 'ptest:b', 30000)).err, 'lease');
    t1.char.x = 12.5; t1.char.z = -3; t1.char.xp = 777; t1.char.hp = 55; t1.char.room = 'vale-test';
    assert.equal(await st.saveChar(t1.char, t1.fence), true);
    assert.equal(t1.char.version, 1);
    await st.heartbeat('ptest:a', [char.id], 30000);
    // expire the lease, let b take it, then a's late save must be refused
    await st.pool.query("UPDATE characters SET lease_until = now() - interval '1 second' WHERE id = $1", [char.id]);
    const t2 = await st.takeChar(g.account, char.id, 'ptest:b', 30000);
    assert.ok(t2.fence > t1.fence);
    assert.equal(t2.char.xp, 777); assert.equal(t2.char.x, 12.5); assert.equal(t2.char.hp, 55);
    t1.char.xp = 1;
    assert.equal(await st.saveChar(t1.char, t1.fence), false, 'fenced out');
    assert.equal(await st.saveChar(t2.char, t2.fence), true);
    assert.equal(await st.clearLeases('ptest:'), 1);
    assert.equal((await st.takeChar(g.account + 999999, char.id, 'ptest:c')).err, 'missing');
  } finally {
    for (const id of made) await st.pool.query('DELETE FROM accounts WHERE id = $1', [id]);
    await st.close();
  }
});
