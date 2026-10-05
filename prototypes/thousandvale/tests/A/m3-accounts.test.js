// M3 accounts (PLAN §5.5 / §9.4 / §11): claim a guest, log in elsewhere with a username, log out, change the
// password, the reset stub (code on the admin page only), rate limits, bans by account and by address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryTokenStore } from '../../js/net/client.js';
import { makeClient } from './helpers.js';
import { m3Server, settle, joinAs, run, waitP, until } from './m3-helpers.js';
import { hashPassword, verifyPassword, TEST_COST } from '../../server/passwords.js';
import { cleanUsername, cleanEmail } from '../../js/sim/accounts.js';

test('scrypt hashes: salted, verify, refuse wrong / malformed; never the password itself', async () => {
  const h1 = await hashPassword('hunter22hunter', TEST_COST), h2 = await hashPassword('hunter22hunter', TEST_COST);
  assert.notEqual(h1, h2, 'salted');
  assert.ok(!h1.includes('hunter'));
  assert.match(h1, /^scrypt\$1024\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(await verifyPassword('hunter22hunter', h1), true);
  assert.equal(await verifyPassword('hunter22hunteR', h1), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.equal(await verifyPassword('x', 'scrypt$1$1$1$zz$'), false);
  assert.equal(cleanUsername('ab'), null); assert.equal(cleanUsername('al dra'), null); assert.equal(cleanUsername('Aldra_99'), 'Aldra_99');
  assert.equal(cleanEmail(''), ''); assert.equal(cleanEmail('nope'), null); assert.equal(cleanEmail('a@b.co'), 'a@b.co');
});

test('claim -> login from a new browser -> same characters; logout revokes only that browser; guests cannot log out', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const tokA = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Claimer', 'warrior', { tokenStore: tokA });
  const rs = []; a.on('accountR', m => rs.push(m));
  // a guest cannot log out (there would be no way back in)
  a.logout(); await run(clock, 50);
  assert.equal(rs.at(-1).ok, false); assert.equal(rs.at(-1).why, 'claimFirst');
  // bad claims
  a.claim('x', 'longenough'); await settle(clock, () => rs.length >= 2);
  assert.equal(rs.at(-1).why, 'user');
  a.claim('claimer', 'short'); await settle(clock, () => rs.length >= 3);
  assert.equal(rs.at(-1).why, 'pass');
  a.claim('admin', 'longenough'); await settle(clock, () => rs.length >= 4);
  assert.equal(rs.at(-1).why, 'user', 'reserved username');
  await run(clock, 4000);     // the account message is rate limited (0.5/s, burst 4)
  a.claim('claimer', 'longenough', 'me@example.com'); await settle(clock, () => rs.length >= 5);
  assert.equal(rs.at(-1).ok, true); assert.equal(a.claimed, true);
  const acct = store.data.accounts[a.account];
  assert.equal(acct.username, 'claimer'); assert.match(acct.passHash, /^scrypt\$/); assert.equal(acct.email, 'me@example.com');
  assert.ok(!JSON.stringify(store.data).includes('longenough'), 'the password is never stored');
  // claiming twice / a taken username
  a.claim('other', 'longenough'); await settle(clock, () => rs.length >= 6);
  assert.equal(rs.at(-1).why, 'claimed');
  const g = await joinAs(srv, clock, 'Squatter');
  const gr = []; g.on('accountR', m => gr.push(m));
  g.claim('CLAIMER', 'longenough'); await settle(clock, () => gr.length);
  assert.equal(gr[0].ok, false); assert.match(gr[0].msg, /taken/);
  // log in from another browser (no token): same account, sees the character
  const b = makeClient(srv, clock, { login: { user: 'Claimer', pass: 'longenough' } });
  await settle(clock, () => b.status === 'select');
  assert.equal(b.account, a.account); assert.equal(b.claimed, true);
  assert.deepEqual(b.chars.map(c => c.name), ['Claimer']);
  const tokB = Object.keys(store.data.tokens).length;
  assert.equal(tokB, 3, 'guest token + squatter + the new session token');
  // wrong password from a third browser: refused, and no guest made behind your back
  const bad = makeClient(srv, clock, { login: { user: 'claimer', pass: 'wrongwrong' } });
  const br = []; bad.on('accountR', m => br.push(m));
  await settle(clock, () => br.length);
  assert.equal(br[0].ok, false); assert.equal(br[0].why, 'auth');
  // logout on b: b's token dies, a keeps playing
  let bClosed = false; b.on('status', st => { if (st === 'reconnecting' || st === 'closed') bClosed = true; });
  b.logout(); await run(clock, 100);
  assert.equal(Object.keys(store.data.tokens).length, 2);
  assert.equal(a.status, 'online');
  a.close(); b.close(); bad.close(); g.close(); await srv.stop();
});

test('password change ends other sessions; reset stub: code only on the admin page, works once, expires', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Forgetful');
  const rs = []; a.on('accountR', m => rs.push(m));
  a.claim('forgetful', 'firstpass1'); await settle(clock, () => rs.length);
  const b = makeClient(srv, clock, { login: { user: 'forgetful', pass: 'firstpass1' } });
  await settle(clock, () => b.status === 'select');
  assert.equal(Object.keys(store.data.tokens).length, 2);
  a.accountOp('password', { old: 'wrongpass', pass: 'secondpass2' }); await settle(clock, () => rs.length >= 2);
  assert.equal(rs.at(-1).ok, false);
  a.accountOp('password', { old: 'firstpass1', pass: 'secondpass2' }); await settle(clock, () => rs.length >= 3);
  assert.equal(rs.at(-1).ok, true);
  assert.equal(Object.keys(store.data.tokens).length, 1, 'only the browser that changed it keeps its token');
  // reset: ask (unknown names get the same answer), the code shows on the admin page, not in any reply
  const c = makeClient(srv, clock, { tokenStore: memoryTokenStore('0'.repeat(64)) });   // a dead token -> it makes a guest; fine
  await settle(clock, () => c.status === 'select');
  const cr = []; c.on('accountR', m => cr.push(m));
  c.accountOp('resetAsk', { user: 'nobodyatall' }); await settle(clock, () => cr.length);
  c.accountOp('resetAsk', { user: 'Forgetful' }); await settle(clock, () => cr.length >= 2);
  assert.equal(cr[0].msg, cr[1].msg, 'never says whether a username exists');
  const resets = srv.world.gateway.admin.resets();
  assert.equal(resets.length, 1); assert.equal(resets[0].username, 'forgetful'); assert.match(resets[0].code, /^[0-9A-F]{8}$/);
  assert.ok(!JSON.stringify(cr).includes(resets[0].code));
  // use it from a signed-out browser
  const d = makeClient(srv, clock, { login: { user: 'forgetful', pass: 'nope-nope' } });
  const dr = []; d.on('accountR', m => dr.push(m));
  await settle(clock, () => dr.length);
  d.accountOp('reset', { user: 'forgetful', code: 'DEADBEEF', pass: 'thirdpass3' }); await settle(clock, () => dr.length >= 2);
  assert.equal(dr.at(-1).ok, false);
  d.accountOp('reset', { user: 'forgetful', code: resets[0].code.toLowerCase(), pass: 'thirdpass3' }); await settle(clock, () => dr.length >= 3);
  assert.equal(dr.at(-1).ok, true, JSON.stringify(dr.at(-1)));
  assert.equal(Object.keys(store.data.tokens).filter(h => store.data.tokens[h].account === a.account).length, 0, 'a reset ends every session');
  d.accountOp('reset', { user: 'forgetful', code: resets[0].code, pass: 'fourthpass4' }); await settle(clock, () => dr.length >= 4);
  assert.equal(dr.at(-1).ok, false, 'a code works once');
  d.close();
  const e = makeClient(srv, clock, { login: { user: 'forgetful', pass: 'thirdpass3' } });
  await settle(clock, () => e.status === 'select');
  assert.equal(e.account, a.account);
  a.close(); b.close(); c.close(); e.close(); await srv.stop();
});

test('login rate limits: 5 wrong passwords lock the username for a while, the right one too; then it opens', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  srv.world.gateway.accounts.limiter;     // exists
  const a = await joinAs(srv, clock, 'Locked');
  let r = null; a.on('accountR', m => { r = m; });
  a.claim('locked', 'rightpass1'); await settle(clock, () => r);
  const tries = [];
  for (let i = 0; i < 7; i++) {
    const x = makeClient(srv, clock, { login: { user: 'locked', pass: i === 6 ? 'rightpass1' : 'wrongpass' + i }, ip: '10.0.0.' + (i + 1) });
    const xs = []; x.on('accountR', m => xs.push(m));
    await settle(clock, () => xs.length);
    tries.push(xs[0].why); x.close();
  }
  assert.deepEqual(tries.slice(0, 5), ['auth', 'auth', 'auth', 'auth', 'auth']);
  assert.equal(tries[5], 'tooManyLogins'); assert.equal(tries[6], 'tooManyLogins', 'even the right password waits');
  await run(clock, 16 * 60000, 1000);
  const ok = makeClient(srv, clock, { login: { user: 'locked', pass: 'rightpass1' } });
  await settle(clock, () => ok.status === 'select');
  assert.equal(ok.claimed, true);
  a.close(); ok.close(); await srv.stop();
});

test('bans: a banned account is refused at the door; an IP ban refuses new sockets from that address', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const tok = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Griefer', 'warrior', { tokenStore: tok });
  const kicks = []; a.on('kick', m => kicks.push(m.code));
  const r = await waitP(clock, srv.world.gateway.admin.ban({ char: a.joined.you.char, untilMs: clock.now() + 3600000, reason: 'spam', ip: false }));
  assert.equal(r.ok, true);
  await run(clock, 200);
  assert.ok(kicks.includes('banned'));
  const again = makeClient(srv, clock, { tokenStore: memoryTokenStore(tok.get()) });
  const k2 = []; again.on('kick', m => k2.push(m.code));
  await run(clock, 300);
  assert.ok(k2.includes('banned'));
  assert.notEqual(again.status, 'online');
  // ip ban
  await waitP(clock, store.banIp(srv.world.gateway.ipHash('10.9.9.9'), clock.now() + 3600000, 'test'));
  const fromIp = makeClient(srv, clock, { ip: '10.9.9.9' });
  const k3 = []; fromIp.on('kick', m => k3.push(m.code));
  await run(clock, 300);
  assert.deepEqual(k3, ['banned']);
  const other = makeClient(srv, clock, { ip: '10.9.9.8' });
  await waitP(clock, other.ready);
  assert.equal(other.status, 'select');
  // the hash is salted: the raw address is not in the store
  assert.ok(!JSON.stringify(store.data.ipBans).includes('10.9.9.9'));
  a.close(); again.close(); fromIp.close(); other.close(); await srv.stop();
});
