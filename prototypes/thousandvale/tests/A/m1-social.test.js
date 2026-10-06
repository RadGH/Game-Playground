// M1 social + loot: parties and the join link, party frames, party/say chat with ignore + mute, Tab target
// checks, personal loot with server uids that survive logout, item ops, the faucet/sink log, castR text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { makeServer, makeClient, joinAs, run, until, waitP, ent, roomOf } from './helpers.js';

test('"join my party" link: a brand-new player lands in the party, in the leader\'s room, next to them', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const W = srv.world;
  const lead = await joinAs(srv, clock, 'Aldra');
  W.transfer(W.online.get(lead.joined.you.char), W.copies[0], { x: W.gate.x + 20, z: W.gate.z }, 'test');
  lead.partyOp('code');
  await until(clock, () => lead.party);
  const code = lead.party.code;
  assert.match(code, /^[A-HJ-NP-Z]{5}$/);
  assert.equal(lead.joinLink('https://play.example/'), 'https://play.example/?join=' + code);
  const friend = makeClient(srv, clock);
  await waitP(clock, friend.ready);
  const ch = await waitP(clock, friend.createChar({ name: 'Friend', cls: 'mage' }));
  await waitP(clock, friend.play(ch.id, { join: code }));
  await run(clock, 300);
  assert.equal(roomOf(srv, friend), roomOf(srv, lead));
  const el = ent(srv, lead), ef = ent(srv, friend);
  assert.ok(Math.hypot(el.x - ef.x, el.z - ef.z) < 3, 'next to the leader');
  assert.equal(friend.party.members.length, 2);
  assert.equal(lead.party.members.length, 2);
  assert.equal(ef.data.partyId, lead.party.id, 'rules can find allies by e.data.partyId');
  // party frames at ~2 Hz with both members
  const frames = []; friend.on('partyFrames', f => frames.push(f));
  await run(clock, 2000);
  assert.ok(frames.length >= 3 && frames.length <= 5, 'frames ' + frames.length);
  assert.equal(frames.at(-1).length, 2);
  assert.ok(frames.at(-1).every(r => r.online && r.hpMax > 0 && r.room === roomOf(srv, lead).id));
  // a bad code is refused but you still get into the world
  const late = makeClient(srv, clock);
  const errs = []; late.on('err', e => errs.push(e));
  await waitP(clock, late.ready);
  const c3 = await waitP(clock, late.createChar({ name: 'Latecomer', cls: 'rogue' }));
  await waitP(clock, late.play(c3.id, { join: 'ZZZZZ' }));
  assert.ok(errs.some(e => e.code === 'noCode'));
  assert.equal(late.status, 'online');
  lead.close(); friend.close(); late.close(); await srv.stop();
});

test('party ops: invite/accept, lead, kick, leave; full at 5', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const cs = [];
  for (const n of ['Pone', 'Ptwo', 'Pthree', 'Pfour', 'Pfive', 'Psix']) cs.push(await joinAs(srv, clock, n));
  const [a, b, c, d, e, f] = cs;
  for (const x of [b, c, d, e, f]) {
    let inv = null; const off = x.on('partyInvite', m => { inv = m; });
    a.partyOp('invite', { name: x.joined.you.name });
    await until(clock, () => inv || (x === f));
    off();
    if (inv) x.partyOp('accept', { party: inv.party });
    await run(clock, 100);
  }
  assert.equal(a.party.members.length, 5);
  const errs = []; a.on('err', m => errs.push(m.code));
  a.partyOp('invite', { name: 'Psix' }); await run(clock, 100);
  assert.ok(errs.includes('partyFull'));
  a.partyOp('lead', { char: b.joined.you.char }); await run(clock, 100);
  assert.equal(c.party.leader, b.joined.you.char);
  b.partyOp('kick', { char: c.joined.you.char }); await run(clock, 100);
  assert.equal(c.party, null);
  assert.equal(b.party.members.length, 4);
  a.partyOp('kick', { char: d.joined.you.char }); await run(clock, 100);
  assert.ok(errs.includes('party'), 'only the leader kicks ' + JSON.stringify(errs) + JSON.stringify(b.party));
  d.partyOp('leave'); await run(clock, 100);
  assert.equal(d.party, null); assert.equal(b.party.members.length, 3);
  for (const x of cs) x.close();
  await srv.stop();
});

test('chat: say carries 40 m, party chat reaches members only; ignore and mute work', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Talker'), b = await joinAs(srv, clock, 'Listener'), c = await joinAs(srv, clock, 'Faraway');
  const T = W.town;
  W.transfer(W.online.get(a.joined.you.char), W.townRoom, { x: T.x, z: T.z }, 't');
  W.transfer(W.online.get(b.joined.you.char), W.townRoom, { x: T.x + 10, z: T.z }, 't');
  W.transfer(W.online.get(c.joined.you.char), W.townRoom, { x: T.x - 50, z: T.z }, 't');
  await run(clock, 200);
  const heard = { a: [], b: [], c: [] };
  a.on('chat', m => heard.a.push(m)); b.on('chat', m => heard.b.push(m)); c.on('chat', m => heard.c.push(m));
  a.say('hello there\u0007   friend');
  await run(clock, 200);
  assert.equal(heard.b.at(-1).text, 'hello there friend', 'control characters and runs of spaces cleaned');
  assert.equal(heard.c.length, 0, 'out of earshot');
  // party chat
  a.partyOp('invite', { name: 'Listener' });
  let inv = null; b.on('partyInvite', m => { inv = m; });
  await until(clock, () => inv); b.partyOp('accept', { party: inv.party });
  await until(clock, () => b.party);
  a.partyChat('to the party');
  await run(clock, 200);
  assert.equal(heard.b.at(-1).ch, 'party'); assert.equal(heard.b.at(-1).text, 'to the party');
  assert.ok(!heard.c.some(m => m.ch === 'party'));
  // ignore: b ignores a -> b hears nothing from a on either channel
  b.ignore('Talker', true);
  await until(clock, () => (b.joined.you.ignore || []).length === 1);
  const nb = heard.b.length;
  a.say('can you hear me'); a.partyChat('or me'); await run(clock, 200);
  assert.equal(heard.b.length, nb);
  b.ignore('Talker', false); await run(clock, 100);
  a.say('now?'); await run(clock, 200);
  assert.equal(heard.b.at(-1).text, 'now?');
  // mute
  W.mute(a.joined.you.char, Date.now() + 60000);
  const errs = []; a.on('err', m => errs.push(m.code));
  a.say('muted words'); a.partyChat('muted'); await run(clock, 200);
  assert.deepEqual(errs, ['muted', 'muted']);
  assert.notEqual(heard.b.at(-1).text, 'muted words');
  a.close(); b.close(); c.close(); await srv.stop();
});

test('Tab target: the server refuses targets that are missing, objects, or too far', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Tabber');
  W.transfer(W.online.get(a.joined.you.char), W.copies[0], { x: W.door.x + 2, z: W.door.z }, 't');
  await run(clock, 200);
  const r = W.copies[0];
  const door = [...r.objects.values()][0];
  const me = ent(srv, a);
  const far = [...r.entities.values()].find(e => e.kind === 'monster' && Math.hypot(e.x - me.x, e.z - me.z) > 80);
  const near = [...r.entities.values()].find(e => e.kind === 'monster' && Math.hypot(e.x - me.x, e.z - me.z) < 50);
  const got = []; a.on('targetR', m => got.push(m));
  a.target(65000); a.target(door.id); a.target(far.id); a.target(near.id);
  await run(clock, 200);
  assert.deepEqual(got.map(g => g.why), ['target', 'target', 'range']);
  assert.equal(me.target, near.id);
  a.close(); await srv.stop();
});

test('loot: items get server uids, land in the bag, survive logout; item ops check ownership', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store });
  await srv.ready;
  const W = srv.world;
  const tok = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Looter', 'warrior', { tokenStore: tok });
  const other = await joinAs(srv, clock, 'Stranger');
  const o = W.online.get(a.joined.you.char);
  W.grant(o, { items: [
    { base: 'rusty_sword', name: 'Rusty sword', rarity: 'common', slot: 'mainhand', value: 8, uid: 'rules:1' },
    { base: 'hide_cap', name: 'Hide cap', rarity: 'rare', slot: 'head', value: 6 },
    { base: 'wolf_pelt', name: 'Wolf pelt', rarity: 'common', value: 3 },
  ], gold: 25, reason: 'kill' });
  await run(clock, 300);
  const bag = a.joined.you.bag;
  assert.equal(bag.length, 3);
  assert.equal(new Set(bag.map(i => i.uid)).size, 3);
  assert.ok(bag.every(i => /^p0-[0-9a-f]{8}-/.test(i.uid)), 'server uids');
  assert.equal(bag[0].ruid, 'rules:1');
  assert.equal(a.joined.you.gold, 25);
  assert.ok(a.evs.some(e => e.type === 'loot' && e.items.length === 3));
  // the rare item forced an immediate save
  assert.ok(Object.values(store.data.chars).find(r => r.id === o.char.id).blob.bag.length === 3);
  // equip the cap, destroy the pelt
  const [sword, cap, pelt] = bag;
  a.item('equip', cap.uid); a.item('destroy', pelt.uid);
  await run(clock, 200);
  assert.equal(a.joined.you.equipment.head.uid, cap.uid);
  assert.deepEqual(a.joined.you.bag.map(i => i.uid), [sword.uid]);
  // someone else's uid, a made-up uid, unequip something not worn
  const errs = []; other.on('err', m => errs.push(m.code)); a.on('err', m => errs.push(m.code));
  other.item('equip', sword.uid); other.item('destroy', sword.uid); a.item('destroy', 'p0-deadbeef-zz'); a.item('unequip', sword.uid);
  await run(clock, 200);
  assert.deepEqual(errs, ['item', 'item', 'item', 'item']);
  assert.deepEqual(a.joined.you.bag.map(i => i.uid), [sword.uid]);
  // logout and back: bag, equipment, gold all kept
  a.leave(); await run(clock, 6000);
  const b = makeClient(srv, clock, { tokenStore: tok });
  await waitP(clock, b.ready);
  await waitP(clock, b.play(o.char.id));
  assert.deepEqual(b.joined.you.bag.map(i => i.uid), [sword.uid]);
  assert.equal(b.joined.you.equipment.head.uid, cap.uid);
  assert.equal(b.joined.you.gold, 25);
  // the faucet/sink log saw it, and flushes to the store
  const eco = W.econ.lastHour();
  assert.equal(eco.faucet.gold, 25); assert.equal(eco.faucet.items, 3); assert.equal(eco.sink.items, 1);
  W.flushEconomy(); await run(clock, 50);
  const rows = Object.values(store.data.economy);
  assert.ok(rows.some(r => r.kind === 'faucet' && r.reason === 'kill' && r.gold === 25 && r.band === 0));
  assert.ok(rows.some(r => r.kind === 'sink' && r.reason === 'destroy' && r.items === 1));
  b.close(); other.close(); await srv.stop();
});

test('kills pay xp, gold and loot that persist (stand-in rules), and the log counts them', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Hunter');
  const r = W.copies[0];
  let kills = 0;
  // play-test 2 (Q3): the gold and loot wait on the corpse until looted
  const lootable = new Set(); a.on('lootable', m => { if (m.on) lootable.add(m.id); else lootable.delete(m.id); });
  for (let k = 0; k < 6; k++) {
    const wolf = [...r.entities.values()].find(e => e.kind === 'monster' && !e.dead);
    W.transfer(W.online.get(a.joined.you.char), r, { x: wolf.x + 1.5, z: wolf.z }, 'test');
    await run(clock, 100);
    for (let g = 0; g < 60 && !wolf.dead; g++) { a.cast({ slot: 0, target: wolf.id }); await run(clock, 950); if (ent(srv, a).dead) { a.respawn(); await run(clock, 200); break; } }
    if (wolf.dead) {
      kills++;
      await run(clock, 300);
      assert.ok(lootable.has(wolf.id), 'the corpse is lootable');
      const me = ent(srv, a); W.transfer(W.online.get(a.joined.you.char), r, { x: wolf.x + 1, z: wolf.z }, 'test');
      void me;
      a.loot('all', { id: wolf.id }); await run(clock, 300);
      assert.ok(!lootable.has(wolf.id), 'looted clean');
    }
  }
  assert.ok(kills >= 3, 'kills ' + kills);
  assert.ok(a.joined.you.gold > 0 && a.joined.you.xp > 0);
  assert.ok(W.econ.lastHour().faucet.gold >= a.joined.you.gold - 1);
  a.close(); await srv.stop();
});

test('castR passes the rules\' refusal text through; held is clamped', async () => {
  const clock = createVirtualClock();
  let lastHeld = null;
  const createRules = () => ({
    addEntity(e) { e.setMax(100, 10); e.setHp(100); },
    intent(e, m) { lastHeld = m.held; return { ok: false, why: 'unknown', text: 'Slot 6 opens at level 18' }; },
  });
  const srv = makeServer({ clock, worldOpts: { createRules } });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Caster');
  const got = []; a.on('castR', m => got.push(m));
  a.cast({ slot: 6, held: 9 });
  await run(clock, 200);
  assert.equal(got[0].text, 'Slot 6 opens at level 18');
  assert.equal(lastHeld, 5);
  a.close(); await srv.stop();
});
