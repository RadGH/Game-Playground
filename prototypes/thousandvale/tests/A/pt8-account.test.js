// Owner feedback 8, W11 (report #32): "I claimed an account before. I am logged in now. I created a new character and it
// says 'needs a linked account' when trying to send mail." Every gate that is about the ACCOUNT asks the account:
// claimed is the account's, and so is the level-5 rule (its highest character). A second character on an established
// account sends mail, talks in public channels and founds a guild from its first minute; a guest still cannot; a claimed
// account with no level-5 character is told it is the LEVEL that is missing, not the claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { m3Server, claimedAs, joinAs, run, until } from './m3-helpers.js';
import { makeClient, waitP } from './helpers.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createRealm } from '../../js/sim/world.js';
import { buildLayout } from '../../js/sim/realm.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createChatFilter } from '../../js/sim/chatfilter.js';
import { testHasher } from '../../server/passwords.js';
import { settle } from './m3-helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
async function save(srv, c) { const o = srv.world.online.get(c.joined.you.char); await srv.world.saveNow(o); await srv.world.flushJournal(); }

test('W11: a NEW character on a claimed account with a level-5 character sends mail, chats in world and founds a guild at level 1', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const main = await claimedAs(srv, clock, 'Mainchar', { level: 6 });
  const getter = await joinAs(srv, clock, 'Getter');
  assert.equal(main.joined.you.acct.claimed, true, 'joined says what the account is');
  await save(srv, main);
  // back to the title screen, a new character, into the world
  const alt = await waitP(clock, main.createChar({ name: 'Xanaver', cls: 'mage' }));
  const j = await waitP(clock, main.play(alt.id));
  assert.equal(j.you.level, 1);
  assert.deepEqual({ claimed: j.you.acct.claimed, level: j.you.acct.level }, { claimed: true, level: 6 }, 'the account is level 6 whatever this character is');
  const o = srv.world.online.get(alt.id);
  srv.world.grant(o, { items: [], gold: 60, reason: 'test' });
  await run(clock, 100);
  const mr = on(main, 'mailR'), errs = on(main, 'err'), chats = on(getter, 'chat'), gr = on(main, 'guildR');
  main.mail('send', { to: 'getter', subject: 'From my alt', body: 'It works.', gold: 3 });
  await until(clock, () => mr.length);
  assert.equal(mr[0].ok, true, 'a level-1 alt of an established account posts a letter: ' + JSON.stringify(mr[0]));
  main.chat('world', 'hello from a level one');
  await until(clock, () => chats.some(c => c.ch === 'world'));
  assert.ok(chats.some(c => c.ch === 'world' && c.name === 'Xanaver'), 'world chat is open: ' + JSON.stringify(errs));
  main.guild('create', { name: 'Second Sons' });
  await until(clock, () => gr.length);
  assert.equal(gr[0].ok, true, JSON.stringify(gr[0]));
  main.close(); getter.close(); await srv.stop();
});

test('W11: a claimed account with NO level-5 character is told it is the level; a guest is told it is the claim; reaching 5 opens it for the account', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const fresh = await claimedAs(srv, clock, 'Freshling', { level: 1 }), guest = await joinAs(srv, clock, 'Guestling'), getter = await joinAs(srv, clock, 'Getter');
  for (const c of [fresh, guest]) srv.world.grant(srv.world.online.get(c.joined.you.char), { items: [], gold: 20, reason: 'test' });
  const mf = on(fresh, 'mailR'), mg = on(guest, 'mailR'), ef = on(fresh, 'err'), eg = on(guest, 'err'), you = on(fresh, 'you');
  fresh.mail('send', { to: 'getter', gold: 1 }); guest.mail('send', { to: 'getter', gold: 1 });
  await until(clock, () => mf.length && mg.length);
  assert.equal(mf[0].why, 'level'); assert.match(mf[0].msg, /one of your characters reaches level 5/); assert.doesNotMatch(mf[0].msg, /claim/i);
  assert.equal(mg[0].why, 'gate'); assert.match(mg[0].msg, /claimed account/);
  fresh.chat('world', 'hi'); guest.chat('world', 'hi');
  await until(clock, () => ef.length && eg.length);
  assert.equal(ef[0].code, 'chatGate'); assert.match(ef[0].msg, /reaches level 5/);
  assert.match(eg[0].msg, /claimed account/);
  // the character reaches 5 (the rules' own award path): the account level follows, the client is told, the post opens
  const o = srv.world.online.get(fresh.joined.you.char);
  for (let k = 0; k < 40 && (o.char.level || 1) < 5; k++) o.room.host.award(o.entity, { xp: 5000 });
  assert.ok(o.char.level >= 5, 'levelled: ' + o.char.level);
  await until(clock, () => you.some(y => y.acct));
  assert.ok(you.find(y => y.acct).acct.level >= 5, 'you {acct} says the account is 5 now');
  fresh.mail('send', { to: 'getter', gold: 1 });
  await until(clock, () => mf.length >= 2);
  assert.equal(mf[1].ok, true, JSON.stringify(mf[1]));
  fresh.close(); guest.close(); getter.close(); await srv.stop();
});

test('W11: the account\'s facts ride on a border-crossing ticket too (claimed, admin, username, level) — a second process knows who you are', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const mk = (key, seed) => buildLayout({ key, name: key, terrain: standInTerrain(seed, 1024), zones: [{ key, sheet: null }] });
  const world = createRealm({ procs: [[mk('west', 3)], [mk('east', 5)]], store, now: clock.now, wallNow: clock.now, lingerMs: 0, log: () => {}, hasher: testHasher, chatFilter: createChatFilter() });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  const boss = makeClient(srv, clock);
  await waitP(clock, boss.ready);
  const ch = await waitP(clock, boss.createChar({ name: 'Bossy', cls: 'warrior' }));
  await waitP(clock, boss.play(ch.id));
  let r = null; boss.on('accountR', m => { if (m.op === 'claim') r = m; });
  boss.claim('bossyx', 'correct horse'); await settle(clock, () => r);
  assert.ok(r && r.ok, JSON.stringify(r));
  await store.setAdmin('bossyx', true);
  const P0 = world.procs[0], P1 = world.procs[1];
  const o0 = P0.online.get(ch.id);
  await until(clock, () => o0.claimed && o0.username === 'bossyx');
  assert.equal(o0.username, 'bossyx', 'a claim made in the world names the account at once');
  o0.alv = 7;       // what the gateway told this process at login for an account whose best character is 7
  P0.moveTo(o0, 'east', { x: 500, z: 500 }, 'test');
  assert.ok(await until(clock, () => boss.status === 'online' && boss.joined.room.id.startsWith('east/'), 10000), 'relocated: ' + boss.status);
  const o1 = P1.online.get(ch.id);
  assert.equal(o1.claimed, true); assert.equal(o1.username, 'bossyx'); assert.equal(o1.alv, 7);
  assert.deepEqual(boss.joined.you.acct, { claimed: true, level: 7, admin: false, username: 'bossyx' });
  boss.close(); await srv.stop();
});
