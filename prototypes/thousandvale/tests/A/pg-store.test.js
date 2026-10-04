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
    // bag + equipment blob round trip, and the economy log upsert (schema v1)
    t2.char.bag = [{ uid: 'p0-aa-1', name: 'Rusty sword', rarity: 'rare' }]; t2.char.equipment = { head: { uid: 'p0-aa-2' } };
    const t3 = await st.takeChar(g.account, char.id, 'ptest:b', 30000);
    t2.char.version = t3.char.version;
    assert.equal(await st.saveChar(t2.char, t3.fence), true);
    const t4 = await st.takeChar(g.account, char.id, 'ptest:b', 30000);
    assert.equal(t4.char.bag[0].uid, 'p0-aa-1'); assert.equal(t4.char.equipment.head.uid, 'p0-aa-2');
    const hour = '2001-01-01T00:00:00.000Z';
    await st.logEconomy([{ hour, band: 9, kind: 'faucet', reason: 'pgtest', gold: 5, items: 1, count: 1 }]);
    await st.logEconomy([{ hour, band: 9, kind: 'faucet', reason: 'pgtest', gold: 7, items: 0, count: 1 }]);
    const er = await st.pool.query("SELECT gold, items, count FROM economy_log WHERE reason = 'pgtest'");
    assert.deepEqual(er.rows[0], { gold: 12, items: 1, count: 2 });
    await st.pool.query("DELETE FROM economy_log WHERE reason = 'pgtest'");
    // journal (schema v2): rows apply on load, a fenced-out writer's rows are refused, a blob save prunes
    const t5 = await st.takeChar(g.account, char.id, 'ptest:b', 30000);
    const j0 = t5.char.jseq || 0;
    const kept = await st.appendJournal([
      { char: char.id, seq: j0 + 1, kind: 'gold', payload: { d: 5 }, fence: t5.fence },
      { char: char.id, seq: j0 + 2, kind: 'bagAdd', payload: { item: { uid: 'p0-aa-9', name: 'Journal gem' } }, fence: t5.fence },
      { char: char.id, seq: j0 + 3, kind: 'gold', payload: { d: 1000 }, fence: t5.fence - 1 },
    ]);
    assert.equal(kept, 2);
    const t6 = await st.takeChar(g.account, char.id, 'ptest:b', 30000);
    assert.equal(t6.char.gold, t5.char.gold + 5);
    assert.ok(t6.char.bag.some(i => i.uid === 'p0-aa-9'));
    assert.equal(t6.char.jseq, j0 + 2);
    assert.equal(await st.saveChar(t6.char, t6.fence), true);
    const left = await st.pool.query('SELECT count(*)::int AS n FROM char_journal WHERE char_id = $1', [char.id]);
    assert.equal(left.rows[0].n, 0, 'pruned by the blob save');
    // trade transaction: both or neither
    const g2 = await st.createGuest('Tester2'); made.push(g2.account);
    const { char: c2 } = await st.createChar(g2.account, { name: nm + 'b', cls: 'mage' });
    const A = await st.takeChar(g.account, char.id, 'ptest:b', 30000), B = await st.takeChar(g2.account, c2.id, 'ptest:b', 30000);
    A.char.gold -= 3; B.char.gold = (B.char.gold || 0) + 3;
    const staleB = { ...B.char, version: B.char.version + 7 };
    assert.equal(await st.tradeChars([{ ch: { ...A.char }, fence: A.fence }, { ch: staleB, fence: B.fence }]), false);
    const A2 = await st.takeChar(g.account, char.id, 'ptest:b', 30000);
    assert.equal(A2.char.gold, A.char.gold + 3, 'rolled back: A unchanged');
    A2.char.gold -= 3;
    assert.equal(await st.tradeChars([{ ch: A2.char, fence: A2.fence }, { ch: B.char, fence: B.fence }]), true);
  } finally {
    for (const id of made) await st.pool.query('DELETE FROM accounts WHERE id = $1', [id]);
    await st.close();
  }
});
