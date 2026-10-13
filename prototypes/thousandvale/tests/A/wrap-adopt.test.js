// Wrap-up, report S#66: "make it so when you sign in, if any browser-based characters are not assigned, ask to claim them."
// A browser that played as a guest keeps the guest's key when its owner signs in to a real account. `peek` lists the
// characters on that key; `adopt` moves them to the signed-in account. Only an UNCLAIMED account's characters move, only
// for whoever holds its key, never one that somebody is playing, and never past the account's character limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { m3Server, claimedAs, joinAs, until, run } from './m3-helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { guestOfferText, guestMovedText } from '../../js/client/account.js';

const ask = async (clock, c, op, a) => { let r = null; const off = c.on('accountR', m => { if (m.op === op) r = m; }); c.accountOp(op, a); await until(clock, () => r, 5000); off(); return r; };

test('S#66: a signed-in account sees the guest characters on this browser\'s old key and takes them over', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const guestKey = memoryTokenStore();
  const guest = await joinAs(srv, clock, 'Mcgee', 'mage', { tokenStore: guestKey });
  const owner = await claimedAs(srv, clock, 'Radley');
  const other = await claimedAs(srv, clock, 'Stranger');
  const ownerAccount = owner.account, guestAccount = guest.account;
  assert.notEqual(ownerAccount, guestAccount);

  const seen = await ask(clock, owner, 'peek', { guest: guestKey.get() });
  assert.deepEqual(seen.chars.map(c => [c.name, c.cls, c.level]), [['Mcgee', 'mage', 1]], 'the key shows its characters');

  // while the guest is still in the world its character stays where it is
  const early = await ask(clock, owner, 'adopt', { guest: guestKey.get() });
  assert.deepEqual([early.ok, early.moved.length, early.left.map(l => [l.name, l.why])], [true, 0, [['Mcgee', 'online']]]);
  assert.match(guestMovedText(early), /Mcgee is still in the world/);

  guest.leave(); await run(clock, 40000);
  const done = await ask(clock, owner, 'adopt', { guest: guestKey.get() });
  assert.deepEqual([done.ok, done.moved.map(m => m.name), done.left], [true, ['Mcgee'], []]);
  assert.match(guestMovedText(done), /Mcgee is on your account now/);
  assert.deepEqual((await store.listChars(ownerAccount)).map(c => c.name).sort(), ['Mcgee', 'Radley']);
  assert.deepEqual(await store.listChars(guestAccount), []);

  // nothing left on the key; a second ask is harmless
  assert.deepEqual((await ask(clock, owner, 'peek', { guest: guestKey.get() })).chars, []);
  // the key of a CLAIMED account opens nothing, nor does a made-up one, nor your own
  assert.deepEqual((await ask(clock, other, 'peek', { guest: 'f'.repeat(64) })).chars, []);
  const mine = await ask(clock, other, 'adopt', { guest: 'not-a-key' });
  assert.deepEqual([mine.ok, mine.moved, mine.left], [true, [], []]);
  owner.close(); other.close(); await srv.stop();
});

test('S#66: a guest cannot adopt (there is no account to hold them), and a claimed account\'s characters cannot be taken with its key', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const victimKey = memoryTokenStore(), aKey = memoryTokenStore();
  const victim = await joinAs(srv, clock, 'Victim', 'warrior', { tokenStore: victimKey });
  const a = await joinAs(srv, clock, 'Asker', 'warrior', { tokenStore: aKey });
  const refused = await ask(clock, a, 'adopt', { guest: victimKey.get() });
  assert.deepEqual([refused.ok, refused.why], [false, 'claimFirst']);
  // the victim claims: its key now belongs to a claimed account
  let cr = null; victim.on('accountR', m => { if (m.op === 'claim') cr = m; }); victim.claim('victimx', 'correct horse');
  const { settle } = await import('./m3-helpers.js'); await settle(clock, () => cr);
  const thief = await claimedAs(srv, clock, 'Thief');
  victim.leave(); await run(clock, 40000);
  const r = await ask(clock, thief, 'adopt', { guest: victimKey.get() });
  assert.deepEqual([r.ok, r.moved, r.left], [true, [], []]);
  assert.deepEqual((await store.listChars(victim.account)).map(c => c.name), ['Victim']);
  a.close(); thief.close(); await srv.stop();
});

test('S#66: the store moves only what fits under the character limit, oldest first', async () => {
  const store = createMemoryStore({ now: () => 1000 });
  const g = await store.createGuest(), t = await store.createGuest();
  for (const n of ['Aaa', 'Bbb', 'Ccc']) await store.createChar(g.account, { name: n, cls: 'mage' });
  await store.createChar(t.account, { name: 'Mine', cls: 'mage' });
  const r = await store.moveChars(g.account, t.account, { limit: 3 });
  assert.deepEqual([r.moved.map(m => m.name), r.left.map(l => [l.name, l.why])], [['Aaa', 'Bbb'], [['Ccc', 'full']]]);
  assert.match(guestMovedText(r), /Aaa, Bbb are on your account now\. Ccc did not fit/);
  assert.deepEqual(await store.moveChars(g.account, g.account), { err: 'same' });
  assert.deepEqual(await store.moveChars(g.account, 999), { err: 'missing' });
});

test('S#66: the offer names every character with its level and calling', () => {
  assert.equal(guestOfferText([{ name: 'Mcgee', level: 6, cls: 'starcaller' }]), 'This browser has a guest character that is not on your account: Mcgee (level 6 starcaller). Move it to your account?');
  assert.match(guestOfferText([{ name: 'A', level: 1, cls: 'mage' }, { name: 'B', level: 2, cls: 'dragon_knight' }]), /2 guest characters .*: A \(level 1 mage\) and B \(level 2 dragon knight\)\. Move them/);
});
