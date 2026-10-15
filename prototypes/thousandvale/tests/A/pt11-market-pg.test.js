// Round 11 (Market, owner #25) on the REAL Postgres store (schema v8): list / browse / buy / cancel / expire are each one
// transaction; two buyers racing on two connections for one listing — exactly one wins, the other's blob is untouched;
// a buyer whose save is refused (stale fence) changes nothing. Skipped unless PG* is set (source ~/.config/thousandvale/dev.env).
// Cleans up after itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { browseFilter, feeFor } from '../../js/sim/market-rules.js';

const HAVE_PG = !!(process.env.PGDATABASE || process.env.DATABASE_URL);
const rnd = () => Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const copy = v => JSON.parse(JSON.stringify(v));

test('pg market: list, browse, a real two-connection race, a refused save, cancel, expiry, the cap', { skip: !HAVE_PG && 'no PG* environment' }, async () => {
  const { createPgStore } = await import('../../server/db/pg-store.js');
  const st = createPgStore();
  await st.init();
  const accounts = [];
  const tag = rnd();
  try {
    const mk = async (n, gold, bag = []) => {
      const g = await st.createGuest(null); accounts.push(g.account);
      const c = (await st.createChar(g.account, { name: n + ' ' + tag, cls: 'warrior' })).char;
      const t = await st.takeChar(g.account, c.id, 'pgmk:' + tag, 30000);
      t.char.gold = gold; t.char.bag = bag;
      assert.equal(await st.saveChar(t.char, t.fence), true);
      return { g, c, t };
    };
    const uid = k => 'pgmk-' + tag + '-' + k;
    const sword = { uid: uid('sword'), name: 'Pgmk Blade ' + tag, rarity: 'rare', type: 'weapon', slot: 'weapon', level: 7 };
    const ore = { uid: uid('ore'), name: 'Pgmk Ore ' + tag, kind: 'material', id: 'copper_ore', count: 9, rarity: 'normal' };
    const S = await mk('Pgseller', 100, [sword, ore]);
    const B1 = await mk('Pgbuyone', 500), B2 = await mk('Pgbuytwo', 500);
    // ---- list: the blob (item out, fee out) + listing + escrow in one go ----
    const now = Date.now();
    const next = copy(S.t.char); next.bag = [ore]; next.gold = 100 - feeFor(40);
    const l1 = await st.marketList({ ch: next, fence: S.t.fence }, { seller: S.c.id, sellerName: S.c.name, item: sword, price: 300, fee: feeFor(40), cap: 20, listedAt: now, expiresAt: now + 30 * 86400000 });
    assert.ok(l1.id, JSON.stringify(l1));
    S.t.char = next;
    // the same uid again (a duplicated item): refused whole, the blob untouched
    const dup = copy(S.t.char); dup.gold = 1;
    assert.equal(await st.marketList({ ch: dup, fence: S.t.fence }, { seller: S.c.id, sellerName: S.c.name, item: sword, price: 5, fee: 1, expiresAt: now + 1000 }), false);
    const n2 = copy(S.t.char); n2.bag = []; n2.gold -= 2;
    const l2 = await st.marketList({ ch: n2, fence: S.t.fence }, { seller: S.c.id, sellerName: S.c.name, item: ore, price: 18, fee: 2, cap: 20, listedAt: now + 1, expiresAt: now + 30 * 86400000 });
    assert.ok(l2.id); S.t.char = n2;
    // the cap is checked inside the transaction (and undoes the save)
    const capped = copy(S.t.char); capped.gold -= 1;
    assert.deepEqual(await st.marketList({ ch: capped, fence: S.t.fence }, { seller: S.c.id, sellerName: S.c.name, item: { uid: uid('x'), name: 'x' }, price: 5, fee: 1, cap: 2, expiresAt: now + 1000 }), { err: 'cap' });
    assert.equal((await st.takeChar(S.g.account, S.c.id, 'pgmk:' + tag, 30000)).char.gold, n2.gold, 'a capped listing paid nothing');
    S.t = await st.takeChar(S.g.account, S.c.id, 'pgmk:' + tag, 30000);
    // ---- browse ----
    const b = await st.marketBrowse({ ...browseFilter({ q: 'pgmk' }), per: 30 }, Date.now());
    assert.equal(b.total, 2); assert.equal(b.list[0].price, 18); assert.equal(b.list[0].item.name, ore.name);
    assert.equal((await st.marketBrowse({ ...browseFilter({ q: 'pgmk', tab: 'gear', slot: 'weapon' }), per: 30 }, Date.now())).list[0].id, l1.id);
    assert.equal((await st.marketBrowse({ ...browseFilter({ q: 'pgmk', tab: 'items', slot: 'material', sort: 'each' }), per: 30 }, Date.now())).list[0].count, 9);
    assert.equal((await st.marketBrowse({ ...browseFilter({ q: 'pgmk_%' }), per: 30 }, Date.now())).total, 0, 'LIKE wildcards are plain text');
    assert.equal(await st.marketCount(S.c.id), 2);
    // ---- the race: two buyers, two connections, one listing ----
    const nb1 = copy(B1.t.char); nb1.gold = 200;
    const nb2 = copy(B2.t.char); nb2.gold = 200;
    const [r1, r2] = await Promise.all([
      st.marketBuy({ ch: nb1, fence: B1.t.fence }, l1.id, { buyer: B1.c.id, buyerName: B1.c.name, price: 300, nowMs: Date.now() }),
      st.marketBuy({ ch: nb2, fence: B2.t.fence }, l1.id, { buyer: B2.c.id, buyerName: B2.c.name, price: 300, nowMs: Date.now() }),
    ]);
    const wins = [r1, r2].filter(r => r && r.ok);
    assert.equal(wins.length, 1, JSON.stringify([r1, r2]));
    assert.deepEqual([r1, r2].find(r => !r.ok), { err: 'gone' });
    const winner = r1.ok ? B1 : B2, loser = r1.ok ? B2 : B1;
    assert.equal((await st.takeChar(winner.g.account, winner.c.id, 'pgmk:' + tag, 30000)).char.gold, 200);
    assert.equal((await st.takeChar(loser.g.account, loser.c.id, 'pgmk:' + tag, 30000)).char.gold, 500, 'the loser\'s blob was never written');
    const wl = await st.mailList(winner.c.id), sl = await st.mailList(S.c.id);
    assert.equal(wl[0].kind, 'market'); assert.equal(wl[0].items[0].uid, sword.uid); assert.equal(wl[0].expiresAt, null);
    assert.equal(sl[0].kind, 'market'); assert.equal(sl[0].gold, 300); assert.match(sl[0].subject, /^Sold: /);
    assert.equal(await st.marketGet(l1.id), null);
    // ---- own listing / stale price / a refused save change nothing ----
    const own = copy(S.t.char);
    assert.deepEqual(await st.marketBuy({ ch: own, fence: S.t.fence }, l2.id, { buyer: S.c.id, buyerName: S.c.name, price: 18 }), { err: 'own' });
    const lt = await st.takeChar(loser.g.account, loser.c.id, 'pgmk:' + tag, 30000);
    const stale = copy(lt.char); stale.gold -= 18;
    assert.deepEqual(await st.marketBuy({ ch: stale, fence: lt.fence }, l2.id, { buyer: loser.c.id, buyerName: loser.c.name, price: 17 }), { err: 'changed' });
    assert.equal(await st.marketBuy({ ch: stale, fence: lt.fence - 1 }, l2.id, { buyer: loser.c.id, buyerName: loser.c.name, price: 18 }), false, 'a stale fence rolls it all back');
    assert.ok(await st.marketGet(l2.id), 'the listing is still there');
    assert.equal((await st.mailList(loser.c.id)).length, 0, 'no letter was written');
    // ---- cancel: the item back by mail ----
    assert.deepEqual(await st.marketCancel(loser.c.id, l2.id, Date.now()), { err: 'gone' }, 'not yours');
    const cc = await st.marketCancel(S.c.id, l2.id, Date.now());
    assert.equal(cc.ok, true); assert.equal(cc.item.uid, ore.uid);
    assert.equal((await st.mailGet(S.c.id, cc.mail)).itemsFull[0].count, 9);
    // ---- expiry ----
    const S2 = await st.takeChar(S.g.account, S.c.id, 'pgmk:' + tag, 30000);
    const n3 = copy(S2.char); n3.gold -= 1;
    const gem = { uid: uid('gem'), name: 'Pgmk Gem ' + tag, kind: 'good', rarity: 'normal' };
    const l3 = await st.marketList({ ch: n3, fence: S2.fence }, { seller: S.c.id, sellerName: S.c.name, item: gem, price: 9, fee: 1, expiresAt: Date.now() - 1 });
    assert.ok(l3.id);
    assert.equal((await st.marketBrowse({ ...browseFilter({ q: 'pgmk' }), per: 30 }, Date.now())).total, 0, 'expired: not on show');
    const ex = await st.marketExpire(Date.now());
    assert.ok(ex.some(x => x.to === S.c.id && x.id === l3.id));
    const back = (await st.mailList(S.c.id)).find(m => /^Unsold/.test(m.subject));
    assert.equal(back.items[0].uid, gem.uid);
    const esc = await st.escrow();
    for (const u of [sword.uid, ore.uid, gem.uid]) assert.ok(esc.uids.includes(u), 'each item is in exactly one letter: ' + u);
    await st.clearLeases('pgmk:' + tag);
  } finally {
    await st.pool.query('DELETE FROM mail WHERE to_char IN (SELECT id FROM characters WHERE account_id = ANY($1::bigint[]))', [accounts]).catch(() => {});
    await st.pool.query('DELETE FROM accounts WHERE id = ANY($1::bigint[])', [accounts]);
    await st.close();
  }
});
