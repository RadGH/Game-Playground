// The Postgres store's M3 methods obey the same rules as the memory store: claim + session tokens, bans, friends,
// guilds, mail (blob + escrow in one transaction, a uid can never be in escrow twice, exact takes, returns and
// expiry), reports, the chat log and world state. Skipped unless PG* is set (source ~/.config/thousandvale/dev.env).
// Cleans up after itself.
import test from 'node:test';
import assert from 'node:assert/strict';

const HAVE_PG = !!(process.env.PGDATABASE || process.env.DATABASE_URL);
const rnd = () => Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');

test('pg store M3: accounts, friends, guilds, mail escrow, reports, chat log, world state', { skip: !HAVE_PG && 'no PG* environment' }, async () => {
  const { createPgStore } = await import('../../server/db/pg-store.js');
  const st = createPgStore();
  await st.init();
  const accounts = [];
  try {
    // ---- accounts ----
    const g1 = await st.createGuest(null), g2 = await st.createGuest(null);
    accounts.push(g1.account, g2.account);
    const user = 'pgt' + rnd();
    assert.deepEqual(await st.claimAccount(g1.account, { username: user, passHash: 'scrypt$x', email: null }), { ok: true });
    assert.equal((await st.claimAccount(g1.account, { username: 'z' + user, passHash: 'h' })).err, 'claimed');
    assert.equal((await st.claimAccount(g2.account, { username: user.toUpperCase(), passHash: 'h' })).err, 'taken');
    const li = await st.loginInfo(user.toUpperCase());
    assert.equal(li.account, g1.account); assert.equal(li.passHash, 'scrypt$x');
    const sess = await st.newToken(g1.account);
    assert.equal((await st.authToken(sess)).account, g1.account);
    assert.equal((await st.authToken(sess)).claimed, true);
    assert.equal(await st.revokeToken(sess), true);
    assert.equal(await st.authToken(sess), null);
    const s2 = await st.newToken(g1.account);
    await st.setPassword(g1.account, 'scrypt$y', s2);
    assert.equal(await st.authToken(g1.token), null, 'a password change ends the other sessions');
    assert.equal((await st.authToken(s2)).account, g1.account);
    await st.setReset(g1.account, 'codehash', Date.now() + 60000);
    assert.equal(await st.resetByCode(user, 'wrong', Date.now()), null);
    assert.equal(await st.resetByCode(user, 'codehash', Date.now()), g1.account);
    assert.equal(await st.resetByCode(user, 'codehash', Date.now()), null, 'once');
    await st.banAccount(g2.account, Date.now() + 60000, 'test');
    assert.ok((await st.authToken(g2.token)).banned > Date.now());
    const ipH = 'test-ip-' + rnd();
    await st.banIp(ipH, Date.now() + 60000, 't');
    assert.equal(await st.ipBanned(ipH, Date.now()), true);
    assert.equal(await st.ipBanned(ipH, Date.now() + 120000), false);
    await st.pool.query('DELETE FROM ip_bans WHERE ip_hash = $1', [ipH]);

    // ---- characters + friends ----
    const n1 = 'Pga ' + rnd(), n2 = 'Pgb ' + rnd();
    const c1 = (await st.createChar(g1.account, { name: n1, cls: 'mage' })).char, c2 = (await st.createChar(g2.account, { name: n2, cls: 'warrior' })).char;
    assert.equal((await st.charByName(n2.toLowerCase())).id, c2.id);
    assert.deepEqual(await st.addFriend(c1.id, c2.id), { ok: true });
    assert.deepEqual(await st.addFriend(c1.id, c2.id), { ok: true }, 'twice is fine');
    assert.equal((await st.addFriend(c1.id, c2.id, 1)).ok, true);
    assert.deepEqual((await st.listFriends(c1.id)).map(f => f.name), [n2]);
    assert.equal(await st.removeFriend(c1.id, c2.id), true);

    // ---- guilds ----
    const gn = 'Pg Guild ' + rnd();
    const gg = await st.createGuild(gn, c1.id);
    assert.equal(gg.guild.members[0].rank, 0);
    assert.equal((await st.createGuild(gn.toUpperCase(), c2.id)).err, 'name');
    assert.equal((await st.createGuild('Other ' + rnd(), c1.id)).err, 'inGuild');
    assert.deepEqual(await st.guildJoin(gg.guild.id, c2.id), { ok: true });
    assert.equal((await st.guildJoin(gg.guild.id, c2.id)).err, 'inGuild');
    await st.guildSetRank(gg.guild.id, c2.id, 1);
    await st.guildMotd(gg.guild.id, 'hello');
    const back = await st.guildOf(c2.id);
    assert.equal(back.motd, 'hello'); assert.equal(back.members.find(m => m.char === c2.id).rank, 1);
    assert.equal(await st.guildDisband(gg.guild.id), true);
    assert.equal(await st.guildOf(c2.id), null);

    // ---- mail: send (blob + escrow), duplicate uid refused, exact take, return, expiry ----
    const t1 = await st.takeChar(g1.account, c1.id, 'pgm3:a', 30000), t2 = await st.takeChar(g2.account, c2.id, 'pgm3:b', 30000);
    const ch1 = t1.char, ch2 = t2.char;
    const u = ['pgm3-' + rnd() + '-1', 'pgm3-' + rnd() + '-2'];
    ch1.bag = [{ uid: u[0], name: 'A' }, { uid: u[1], name: 'B' }]; ch1.gold = 50;
    assert.equal(await st.saveChar(ch1, t1.fence), true);
    const next = JSON.parse(JSON.stringify(ch1)); next.bag = [ch1.bag[1]]; next.gold = 40;
    const sent = await st.mailSend({ ch: next, fence: t1.fence }, { to: c2.id, fromChar: c1.id, fromName: n1, subject: 's', body: 'b', gold: 9, items: [ch1.bag[0]], kind: 'player', sentAt: Date.now(), expiresAt: Date.now() + 60000 });
    assert.ok(sent.id);
    assert.equal(next.version, ch1.version + 1);
    // a second letter with the same uid (a duplicated item) is refused whole — the sender's blob did not change
    const dup = JSON.parse(JSON.stringify(next)); dup.gold = 1;
    assert.equal(await st.mailSend({ ch: dup, fence: t1.fence }, { to: c2.id, fromChar: c1.id, fromName: n1, gold: 1, items: [ch1.bag[0]], kind: 'player' }), false);
    const reread = await st.takeChar(g1.account, c1.id, 'pgm3:a', 30000);
    assert.equal(reread.char.gold, 40, 'the refused letter left the blob alone');
    // a stale fence is refused
    assert.equal(await st.mailSend({ ch: { ...JSON.parse(JSON.stringify(next)) }, fence: t1.fence }, { to: c2.id, fromChar: c1.id, fromName: n1, gold: 0, items: [] }), false);
    const list = await st.mailList(c2.id);
    assert.equal(list[0].items[0].uid, u[0]); assert.equal(list[0].gold, 9);
    assert.equal(await st.mailUnread(c2.id), 1);
    const full = await st.mailGet(c2.id, sent.id);
    assert.equal(full.itemsFull[0].name, 'A');
    // take with the wrong uid list: refused; right list: in
    const n2b = JSON.parse(JSON.stringify(ch2)); n2b.bag = [full.itemsFull[0]]; n2b.gold = 9;
    assert.equal(await st.mailTake({ ch: n2b, fence: t2.fence }, sent.id, ['nope'], Date.now()), false);
    assert.equal(await st.mailTake({ ch: n2b, fence: t2.fence }, sent.id, [u[0]], Date.now()), true);
    assert.equal(await st.mailTake({ ch: n2b, fence: t2.fence }, sent.id, [u[0]], Date.now()), false, 'twice');
    assert.equal(await st.mailDelete(c2.id, sent.id), true);
    // return + expiry
    const r2 = JSON.parse(JSON.stringify(reread.char)); r2.bag = []; r2.gold = 30;
    const s2m = await st.mailSend({ ch: r2, fence: reread.fence }, { to: c2.id, fromChar: c1.id, fromName: n1, gold: 10, items: [reread.char.bag[0]], kind: 'player', sentAt: Date.now() - 120000, expiresAt: Date.now() - 1000 });
    assert.ok(s2m.id);
    const ex = await st.mailExpire(Date.now());
    assert.ok(ex.some(x => x.to === c1.id && x.returned));
    const mine = await st.mailList(c1.id);
    assert.equal(mine[0].kind, 'return'); assert.equal(mine[0].expiresAt, null); assert.equal(mine[0].items[0].uid, u[1]);
    assert.equal(await st.mailReturn(c1.id, mine[0].id, Date.now()), false, 'returned mail does not bounce again');
    assert.equal(await st.mailDelete(c1.id, mine[0].id), false, 'it still holds things');
    const esc = await st.escrow();
    assert.ok(esc.uids.includes(u[1]));
    await st.pool.query('DELETE FROM items WHERE uid = ANY($1)', [u]);

    // ---- reports, chat log, world state ----
    const rid = await st.addReport({ fromChar: c1.id, fromName: n1, aboutChar: c2.id, aboutName: n2, reason: 'spam', text: 't', chat: [{ text: 'x' }] });
    assert.ok((await st.listReports(5)).some(r => r.id === rid));
    assert.equal(await st.handleReport(rid, Date.now()), true);
    await st.pool.query('DELETE FROM reports WHERE id = $1', [rid]);
    await st.logChat([{ at: Date.now(), ch: 'world', from: c1.id, name: n1, to: null, text: 'pgm3 ' + user }]);
    const cl = await st.pool.query('SELECT count(*)::int AS n FROM chat_log WHERE text = $1', ['pgm3 ' + user]);
    assert.equal(cl.rows[0].n, 1);
    await st.pool.query('DELETE FROM chat_log WHERE text = $1', ['pgm3 ' + user]);
    await st.setWorld('test:' + user, { a: 1 });
    assert.deepEqual(await st.getWorld('test:' + user), { a: 1 });
    await st.pool.query('DELETE FROM world_state WHERE key = $1', ['test:' + user]);
    await st.clearLeases('pgm3:');
  } finally {
    await st.pool.query('DELETE FROM mail WHERE to_char IN (SELECT id FROM characters WHERE account_id = ANY($1::bigint[])) OR from_char IN (SELECT id FROM characters WHERE account_id = ANY($1::bigint[]))', [accounts]).catch(() => {});
    await st.pool.query('DELETE FROM accounts WHERE id = ANY($1::bigint[])', [accounts]);
    await st.close();
  }
});

test('pg: deleting an account takes everything with it (characters, friends, guild rows, mail + escrow, chat lines)', { skip: !HAVE_PG && 'no PG* environment' }, async () => {
  const { createPgStore } = await import('../../server/db/pg-store.js');
  const st = createPgStore();
  await st.init();
  try {
    const g = await st.createGuest(null), other = await st.createGuest(null);
    const a = (await st.createChar(g.account, { name: 'Gone ' + rnd(), cls: 'mage' })).char;
    const b = (await st.createChar(other.account, { name: 'Stays ' + rnd(), cls: 'mage' })).char;
    await st.addFriend(a.id, b.id); await st.addFriend(b.id, a.id);
    const gu = await st.createGuild('Gone Guild ' + rnd(), a.id);
    await st.guildJoin(gu.guild.id, b.id);
    const ta = await st.takeChar(g.account, a.id, 'pgdel:a', 30000);
    const uid = 'pgdel-' + rnd();
    ta.char.bag = [{ uid, name: 'X' }]; await st.saveChar(ta.char, ta.fence);
    const nx = JSON.parse(JSON.stringify(ta.char)); nx.bag = [];
    await st.mailSystem({ to: a.id, fromName: 'The Vale', subject: 'to the gone one', items: [{ uid: uid + 'b', name: 'Y' }] });
    const sent = await st.mailSend({ ch: nx, fence: ta.fence }, { to: b.id, fromChar: a.id, fromName: 'Gone', gold: 0, items: [{ uid, name: 'X' }], kind: 'player' });
    assert.ok(sent.id);
    await st.logChat([{ at: Date.now(), ch: 'world', from: a.id, name: 'Gone', text: 'bye ' + uid }]);
    await st.pool.query('DELETE FROM accounts WHERE id = $1', [g.account]);
    const n = async (sql, p) => (await st.pool.query(sql, p)).rows[0].n;
    assert.equal(await n('SELECT count(*)::int AS n FROM characters WHERE id = $1', [a.id]), 0);
    assert.equal(await n('SELECT count(*)::int AS n FROM friends WHERE char_id = $1 OR friend_id = $1', [a.id]), 0);
    assert.equal(await n('SELECT count(*)::int AS n FROM guild_members WHERE char_id = $1', [a.id]), 0);
    assert.equal(await n('SELECT count(*)::int AS n FROM mail WHERE to_char = $1', [a.id]), 0, 'mail to them');
    assert.equal(await n('SELECT count(*)::int AS n FROM items WHERE uid = $1', [uid + 'b']), 0, 'their escrow');
    assert.equal(await n('SELECT count(*)::int AS n FROM chat_log WHERE text = $1', ['bye ' + uid]), 0, 'their chat lines');
    const kept = await st.mailGet(b.id, sent.id);
    assert.equal(kept.fromChar, null, 'a letter they sent stays with the receiver'); assert.equal(kept.itemsFull[0].uid, uid);
    await st.pool.query('DELETE FROM accounts WHERE id = $1', [other.account]);
    assert.equal(await n('SELECT count(*)::int AS n FROM items WHERE uid = $1', [uid]), 0);
  } finally { await st.close(); }
});
