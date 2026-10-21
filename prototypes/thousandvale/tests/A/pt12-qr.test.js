// Play-test 12 (#73): sign a phone in by scanning a QR code. A signed-in, CLAIMED account mints a one-time code
// (`account {op:'qrMake'}`); a signed-out browser trades it for a session token (`account {op:'qrUse', code}`).
// The code works once, runs out after QR_SIGNIN.ttlMs, a newer code replaces the older one, guests cannot make one,
// and the password is never part of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from './helpers.js';
import { m3Server, settle, joinAs, run } from './m3-helpers.js';
import { QR_SIGNIN } from '../../js/sim/accounts.js';

/** A browser that is signed out (a wrong login leaves the socket anonymous) — what the phone is before it scans. */
async function signedOut(srv, clock) {
  const d = makeClient(srv, clock, { login: { user: 'nobody', pass: 'wrong-wrong' } });
  const rs = []; d.on('accountR', m => rs.push(m));
  await settle(clock, () => rs.length);
  return { d, rs };
}

test('#73: a claimed account makes a code; a signed-out browser uses it ONCE and lands on the same account', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Deckhand');
  const ar = []; a.on('accountR', m => ar.push(m));
  // a guest cannot make one
  a.accountOp('qrMake'); await settle(clock, () => ar.length);
  assert.equal(ar[0].ok, false); assert.equal(ar[0].why, 'claimFirst');
  a.claim('deckhand', 'longenough'); await settle(clock, () => ar.length >= 2);
  assert.equal(ar[1].ok, true);
  await run(clock, 2500);
  a.accountOp('qrMake'); await settle(clock, () => ar.length >= 3);
  const made = ar[2];
  assert.equal(made.ok, true); assert.match(made.code, /^[0-9a-f]{32}$/); assert.equal(made.ttl, QR_SIGNIN.ttlMs);
  assert.ok(!JSON.stringify(made).includes('longenough'), 'the password is not in it');

  const { d, rs } = await signedOut(srv, clock);
  d.accountOp('qrUse', { code: made.code }); await settle(clock, () => rs.length >= 2);
  const used = rs.at(-1);
  assert.equal(used.ok, true, JSON.stringify(used)); assert.match(used.token, /^[0-9a-f]{64}$/); assert.equal(used.username, 'deckhand');
  // the token is a real session of the same account: a new browser with it sees the character
  const { memoryTokenStore } = await import('../../js/net/client.js');
  const tok = memoryTokenStore(); tok.set(used.token);
  const phone = makeClient(srv, clock, { tokenStore: tok });
  await settle(clock, () => phone.status === 'select');
  assert.equal(phone.account, a.account); assert.equal(phone.claimed, true);
  assert.deepEqual(phone.chars.map(c => c.name), ['Deckhand']);
  // single use
  await run(clock, 2500);
  d.accountOp('qrUse', { code: made.code }); await settle(clock, () => rs.length >= 3);
  assert.equal(rs.at(-1).ok, false, 'a code works once');
  assert.equal(srv.world.gateway.accounts?.qrLive?.() ?? 0, 0);
  d.close(); phone.close(); a.close();
});

test('#73: a code runs out after the time limit; a newer code replaces the older one; junk is refused', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Steamer');
  const ar = []; a.on('accountR', m => ar.push(m));
  a.claim('steamer', 'longenough'); await settle(clock, () => ar.length);
  await run(clock, 2500);
  a.accountOp('qrMake'); await settle(clock, () => ar.length >= 2);
  const first = ar[1].code;
  await run(clock, 2500);
  a.accountOp('qrMake'); await settle(clock, () => ar.length >= 3);
  const second = ar[2].code;
  assert.notEqual(first, second);

  const { d, rs } = await signedOut(srv, clock);
  d.accountOp('qrUse', { code: first }); await settle(clock, () => rs.length >= 2);
  assert.equal(rs.at(-1).ok, false, 'the older code was replaced');
  await run(clock, 2500);
  d.accountOp('qrUse', { code: 'not-a-code' }); await settle(clock, () => rs.length >= 3);
  assert.equal(rs.at(-1).ok, false);
  // wait past the limit: the newer code has run out too
  await run(clock, QR_SIGNIN.ttlMs + 1000, 500);
  d.accountOp('qrUse', { code: second }); await settle(clock, () => rs.length >= 4);
  assert.equal(rs.at(-1).ok, false, 'a code runs out');
  assert.match(rs.at(-1).msg, /run out|used/);
  d.close(); a.close();
});
