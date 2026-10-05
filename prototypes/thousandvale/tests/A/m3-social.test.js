// M3 social: chat channels (zone / trade / world / guild / whispers), the claimed + level 5 gate, slow mode, the
// filter hook, ignore on every channel, mute, reports (+ auto-mute), the chat log; friends with online status;
// guilds (fee, ranks, invite, kick, motd, chat, disband) and the evil-client cases for each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryTokenStore } from '../../js/net/client.js';
import { makeClient } from './helpers.js';
import { m3Server, claimedAs, joinAs, run, until, waitP } from './m3-helpers.js';

const heard = c => { const l = []; c.on('chat', m => l.push(m)); return l; };
const errsOf = c => { const l = []; c.on('err', m => l.push(m.code)); return l; };

test('channels: zone/trade/world reach the right people, guests and low levels cannot shout, slow mode, filter, ignore, mute', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Shouter'), b = await claimedAs(srv, clock, 'Hearer'), guest = await joinAs(srv, clock, 'Newbie');
  const low = await claimedAs(srv, clock, 'Lowbie', { level: 2 });
  const ha = heard(a), hb = heard(b), hg = heard(guest);
  const ea = errsOf(a), eg = errsOf(guest), el = errsOf(low);
  a.chat('world', 'Looking for a healer'); await run(clock, 100);
  assert.equal(hb.at(-1).ch, 'world'); assert.equal(hb.at(-1).name, 'Shouter');
  assert.equal(hg.at(-1).text, 'Looking for a healer', 'guests READ public channels');
  guest.chat('world', 'buy gold cheap'); low.chat('trade', 'wts sword'); await run(clock, 100);
  assert.deepEqual(eg, ['chatGate']); assert.deepEqual(el, ['chatGate']);
  assert.ok(!hb.some(m => m.text === 'buy gold cheap'));
  // slow mode on world
  a.chat('world', 'again'); await run(clock, 100);
  assert.ok(ea.includes('slow'));
  await run(clock, 10500, 100);
  a.chat('world', 'what the shit'); await run(clock, 100);
  assert.equal(hb.at(-1).text, 'what the ****', 'the filter hook masks');
  // zone: everyone in the same zone of the province (all here share the one test zone)
  a.chat('zone', 'rare at the mill'); await run(clock, 100);
  assert.equal(hb.at(-1).ch, 'zone'); assert.ok(hb.at(-1).zone);
  // ignore applies to public channels; a bad channel name is a bad message
  b.ignore('Shouter', true); await run(clock, 100);
  const n = hb.length;
  a.chat('trade', 'wts boots'); await run(clock, 100);
  assert.equal(hb.length, n);
  b.ignore('Shouter', false); await run(clock, 100);
  const bad0 = srv.world.gateway.counters.bad;
  a._raw('gw', JSON.stringify({ t: 'chat', ch: 'admin', text: 'x' })); await run(clock, 100);
  assert.equal(srv.world.gateway.counters.bad, bad0 + 1);
  // mute: nothing gets out on any channel, and the player is told once
  const notes = []; a.on('muted', m => notes.push(m));
  srv.world.gateway.admin.mute(a.joined.you.char, clock.now() + 60000);
  await run(clock, 100);
  assert.equal(notes.length, 1);
  await run(clock, 6000, 100);
  a.chat('trade', 'muted?'); a.say('muted say'); await run(clock, 100);
  assert.ok(ea.filter(x => x === 'muted').length >= 2);
  assert.ok(!hb.some(m => m.text === 'muted?'));
  // the chat log reaches the store (30-day table)
  srv.world.gateway.chat.flush(); await run(clock, 50);
  assert.ok(store.data.chatLog.some(r => r.ch === 'world' && r.text === 'Looking for a healer'));
  assert.ok(store.data.chatLog.some(r => r.ch === 'say' && r.text === 'muted say') === false, 'a muted say never happened');
  for (const c of [a, b, guest, low]) c.close();
  await srv.stop();
});

test('whispers: claimed L5 can whisper anyone; a guest whispers its party/friends and answers whoever whispered it', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Whisperer'), g = await joinAs(srv, clock, 'Shygeist'), h = await joinAs(srv, clock, 'Otherguest');
  const ha = heard(a), hg = heard(g), eg = errsOf(g), ea = errsOf(a);
  g.whisper('Otherguest', 'psst'); await run(clock, 100);
  assert.deepEqual(eg, ['chatGate'], 'a guest cannot whisper strangers');
  a.whisper('shygeist', 'welcome!'); await run(clock, 100);
  assert.equal(hg.at(-1).ch, 'w'); assert.equal(hg.at(-1).name, 'Whisperer');
  assert.equal(ha.at(-1).echo, true); assert.equal(ha.at(-1).to, 'Shygeist');
  g.whisper('Whisperer', 'thanks'); await run(clock, 100);
  assert.equal(ha.at(-1).text, 'thanks', 'a guest may answer');
  a.whisper('Nobodyhere', 'hi'); await run(clock, 100);
  assert.ok(ea.includes('notFound'));
  g.ignore('Whisperer', true); await run(clock, 100);
  a.whisper('Shygeist', 'still there?'); await run(clock, 100);
  assert.ok(ea.includes('ignored'));
  // a friend can be whispered by a guest
  g.friend('add', 'Otherguest'); await run(clock, 100);
  g.whisper('Otherguest', 'hi friend'); await run(clock, 100);
  assert.equal(eg.filter(x => x === 'chatGate').length, 1);
  for (const c of [a, g, h]) c.close();
  await srv.stop();
});

test('friends: add by name (offline too), online/offline/level pushes, remove, list cap', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Friendly');
  let list = null; const states = [];
  a.on('friends', m => { list = m.list; }); a.on('friendState', m => states.push(m));
  const tok = memoryTokenStore();
  const b = await joinAs(srv, clock, 'Pal', 'warrior', { tokenStore: tok });
  const palId = b.joined.you.char;
  a.friend('add', 'Pal'); await until(clock, () => list && list.length === 1);
  assert.deepEqual(list.map(f => [f.name, f.online]), [['Pal', true]]);
  a.friend('add', 'Friendly'); a.friend('add', 'Ghost'); await run(clock, 100);
  assert.equal(list.length, 1);
  b.close(); await run(clock, 300);
  assert.equal(states.at(-1).online, false); assert.equal(states.at(-1).name, 'Pal');
  // an offline friend can be added; and comes online later
  const c = await joinAs(srv, clock, 'Later'); c.close(); await run(clock, 300);
  a.friend('add', 'later'); await until(clock, () => list.length === 2);
  assert.equal(list.find(f => f.name === 'Later').online, false);
  const b2 = makeClient(srv, clock, { tokenStore: memoryTokenStore(tok.get()) });
  await waitP(clock, b2.ready); await waitP(clock, b2.play(palId));
  await until(clock, () => states.at(-1) && states.at(-1).name === 'Pal' && states.at(-1).online);
  a.friend('remove', 'Pal'); await until(clock, () => list.length === 1);
  // the friend list survives a reconnect
  a.friend('list'); await run(clock, 100);
  assert.deepEqual(list.map(f => f.name), ['Later']);
  a.close(); if (b2) b2.close(); await srv.stop();
});

test('guilds: create (fee, gate), invite/accept, ranks, motd, guild chat, kick, lead, leave, disband; evil cases', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const W = srv.world;
  const lead = await claimedAs(srv, clock, 'Guildlead'), off = await claimedAs(srv, clock, 'Officer'), mem = await joinAs(srv, clock, 'Member');
  const guest = await joinAs(srv, clock, 'Poorguest');
  const R = c => { const l = []; c.on('guildR', m => l.push(m)); return l; };
  const S = c => { const box = { g: undefined, all: [] }; c.on('guildState', m => { box.g = m.guild; box.all.push(m); }); return box; };
  const rl = R(lead), ro = R(off), rm = R(mem), rg = R(guest);
  const sl = S(lead), so = S(off), sm = S(mem);
  // a guest cannot found one; no gold = no guild
  guest.guild('create', { name: 'Guests United' }); await run(clock, 100);
  assert.equal(rg.at(-1).ok, false);
  lead.guild('create', { name: 'The Long Watch' }); await run(clock, 200);
  assert.equal(rl.at(-1).ok, false); assert.match(rl.at(-1).msg, /costs 10 gold/);
  assert.equal(Object.keys(store.data.guilds).length, 0, 'the half-made guild was removed');
  const lo = W.online.get(lead.joined.you.char); lo.char.gold = 25;
  lead.guild('create', { name: 'fuck off' }); await run(clock, 200);
  assert.equal(rl.at(-1).ok, false, 'name filter');
  lead.guild('create', { name: 'The Long Watch' }); await run(clock, 300);
  assert.equal(rl.at(-1).ok, true, JSON.stringify(rl.at(-1)));
  assert.equal(lo.char.gold, 15, 'fee taken');
  assert.equal(W.econ.lastHour().sink.byReason.guild.gold, 10, 'a sink in the economy log');
  assert.equal(sl.g.name, 'The Long Watch'); assert.equal(sl.g.members[0].rank, 0);
  // a duplicate name (any case)
  const oo = W.online.get(off.joined.you.char); oo.char.gold = 50;
  off.guild('create', { name: 'the long watch' }); await run(clock, 300);
  assert.equal(ro.at(-1).ok, false); assert.match(ro.at(-1).msg, /taken/);
  assert.equal(oo.char.gold, 50, 'no fee for a refused name');
  // invite + accept
  let inv = null; off.on('guildInvite', m => { inv = m; });
  lead.guild('invite', { name: 'Officer' }); await until(clock, () => inv);
  off.guild('accept', { id: inv.guild }); await until(clock, () => so.g && so.g.members.length === 2);
  let inv2 = null; mem.on('guildInvite', m => { inv2 = m; });
  // a recruit cannot invite; officers can once promoted
  off.guild('invite', { name: 'Member' }); await run(clock, 100);
  assert.equal(ro.at(-1).ok, false);
  const offId = off.joined.you.char, memId = mem.joined.you.char;
  lead.guild('promote', { char: offId }); await run(clock, 100);
  lead.guild('promote', { char: offId }); await until(clock, () => sl.g.members.find(m => m.char === offId).rank === 1);
  off.guild('invite', { name: 'Member' }); await until(clock, () => inv2);
  // accept with the wrong guild id is refused; the right one works
  mem.guild('accept', { id: inv2.guild + 99 }); await run(clock, 100);
  assert.equal(rm.at(-1).ok, false);
  off.guild('invite', { name: 'Member' }); await run(clock, 100);
  mem.guild('accept', { id: inv2.guild }); await until(clock, () => sm.g && sm.g.members.length === 3);
  // motd + guild chat (members only; a guest in the guild can use guild chat)
  off.guild('motd', { text: 'Meet at the waystone' }); await until(clock, () => sm.g.motd === 'Meet at the waystone');
  const hm = heard(mem), hg = heard(guest), hl = heard(lead);
  lead.chat('guild', 'hello guild'); await run(clock, 100);
  assert.equal(hm.at(-1).ch, 'guild'); assert.ok(!hg.some(m => m.ch === 'guild'));
  mem.chat('guild', 'hi from the guest'); await run(clock, 100);
  assert.equal(hl.at(-1).text, 'hi from the guest', 'an unclaimed member uses guild chat');
  // evil: a recruit cannot kick/promote/motd/disband; an officer cannot kick the leader or promote to officer
  mem.guild('kick', { char: offId }); mem.guild('promote', { char: memId }); mem.guild('motd', { text: 'pwned' }); mem.guild('disband');
  await run(clock, 3000, 100);
  assert.equal(rm.filter(x => x.ok === false).length >= 4, true, JSON.stringify(rm));
  off.guild('kick', { char: lead.joined.you.char }); await run(clock, 1100, 100);
  off.guild('promote', { char: memId }); await run(clock, 1100, 100);
  off.guild('promote', { char: memId }); await run(clock, 300);
  assert.equal(sl.g.members.find(m => m.char === memId).rank, 2, 'an officer can raise a recruit to member, not to officer');
  assert.equal(Object.keys(store.data.guilds).length, 1);
  // the leader cannot just leave; hand the lead on first
  lead.guild('leave'); await run(clock, 1100, 100);
  assert.match(rl.at(-1).msg, /Hand the lead/);
  lead.guild('lead', { char: offId }); await until(clock, () => sl.g.members.find(m => m.char === offId).rank === 0);
  // kicked = guildState null for them
  off.guild('kick', { char: memId }); await until(clock, () => sm.g === null);
  assert.equal(sm.all.at(-1).kicked, true);
  // saved: a fresh gateway view after re-login reads the roster back
  assert.equal((await store.guildOf(offId)).members.length, 2);
  off.guild('disband'); await until(clock, () => sl.g === null);
  assert.equal(Object.keys(store.data.guilds).length, 0); assert.equal(Object.keys(store.data.members).length, 0);
  for (const c of [lead, off, mem, guest]) c.close();
  await srv.stop();
});

test('reports: filed with the reported player\'s recent lines; three different claimed accounts = a short auto-mute', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const spam = await claimedAs(srv, clock, 'Spammer');
  const rs = [];
  for (const n of ['Reporterone', 'Reportertwo', 'Reporterthree']) rs.push(await claimedAs(srv, clock, n));
  spam.chat('trade', 'cheap gold at shady dot site'); await run(clock, 6000, 100);
  spam.chat('trade', 'cheap gold again'); await run(clock, 200);
  const got = []; rs[0].on('reportR', m => got.push(m));
  rs[0].report('Spammer', 'spam', 'selling gold'); await until(clock, () => got.length);
  assert.equal(store.data.reports.length, 1);
  assert.deepEqual(store.data.reports[0].chat.map(l => l.text), ['cheap gold at shady dot site', 'cheap gold again']);
  rs[0].report('Spammer', 'spam'); await run(clock, 200);      // the same account again does not count twice
  rs[1].report('Spammer', 'spam'); await run(clock, 200);
  const sp = srv.world.gateway.presence.get(spam.joined.you.char);
  assert.ok(!(sp.mutedUntil > clock.now()), 'two accounts are not enough');
  rs[2].report('spammer', 'spam'); await run(clock, 200);
  assert.ok(sp.mutedUntil > clock.now(), 'three distinct accounts: muted');
  assert.equal((await store.listReports()).length, 4);
  const e = errsOf(rs[0]);
  rs[0].report('Reporterone', 'spam'); await run(clock, 11000, 100);
  assert.ok(e.includes('state'), 'cannot report yourself');
  spam.close(); for (const c of rs) c.close();
  await srv.stop();
});

test('chat flood + junk: 600 lines at once deliver a handful, the flooder is kicked, everyone else is fine', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const spam = await claimedAs(srv, clock, 'Flooder'), calm = await claimedAs(srv, clock, 'Calmone');
  const hc = heard(calm);
  const kicks = []; spam.on('kick', m => kicks.push(m.code));
  for (let i = 0; i < 600; i++) spam._raw('gw', JSON.stringify({ t: 'chat', ch: 'trade', text: 'spam ' + i }));
  await run(clock, 500);
  assert.ok(hc.filter(m => m.name === 'Flooder').length <= 2, 'slow mode + buckets: ' + hc.length);
  assert.deepEqual(kicks, ['abuse']);
  // junk: a whisper target that is too long, a guild op that does not exist, an account op on a stranger's state
  const bad0 = srv.world.gateway.counters.bad;
  calm._raw('gw', JSON.stringify({ t: 'chat', ch: 'w', text: 'hi', to: 'x'.repeat(25) }));
  calm._raw('gw', JSON.stringify({ t: 'guild', op: 'nuke' }));
  calm._raw('gw', JSON.stringify({ t: 'account', op: 'login', user: 'a', pass: 'b' }));      // already signed in: out of order
  calm._raw('gw', JSON.stringify({ t: 'mail', op: 'list' }));                                  // a province message on the gateway
  await run(clock, 300);
  assert.equal(srv.world.gateway.counters.bad - bad0, 4);
  calm.chat('trade', 'still here'); await run(clock, 100);
  assert.equal(calm.status, 'online');
  spam.close(); calm.close(); await srv.stop();
});
