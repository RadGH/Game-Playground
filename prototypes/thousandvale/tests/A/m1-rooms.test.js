// M1 rooms: the town hub (never copied), wilds copies, dungeon instances per party, handoffs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, makeClient, joinAs, run, until, waitP, ent, roomOf } from './helpers.js';

const walk = async (clock, c, to, srv, maxMs = 30000) => {
  let s = c._s || 0;
  for (let t = 0; t < maxMs; t += 50) {
    const e = ent(srv, c);
    const dx = to.x - e.x, dz = to.z - e.z, d = Math.hypot(dx, dz);
    if (d < 1) break;
    c.input({ s: ++s, dt: 50, mx: dx / d, mz: dz / d, yaw: 0, b: 1 });
    await run(clock, 50, 50);
  }
  c._s = s;
  await run(clock, 300);
};

test('new characters start in the town; walking out hands off to the wilds and back in to the town', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Walker');
  const W = srv.world;
  assert.equal(a.joined.room.kind, 'town');
  assert.equal(roomOf(srv, a), W.townRoom);
  assert.ok(a.joined.room.area && a.joined.room.area.r > 20);
  const joins = [];
  a.on('joined', j => joins.push(j));
  const out = { x: W.town.x + W.town.r + 15, z: W.town.z };
  await walk(clock, a, out, srv);
  assert.equal(roomOf(srv, a).kind, 'wilds');
  assert.ok(joins.at(-1).handoff.from.endsWith('/town:0'));
  assert.equal(joins.at(-1).handoff.via, 'gate');
  assert.equal(joins.at(-1).room.terrain, a.joined.room.terrain, 'same terrain: the client keeps its ground mesh');
  const hp = ent(srv, a).hp;
  await walk(clock, a, { x: W.town.x, z: W.town.z }, srv);
  assert.equal(roomOf(srv, a), W.townRoom);
  assert.equal(ent(srv, a).hp, hp, 'state kept across the handoff');
  // the town never copies: with a copy cap of 1, two players in two wilds copies meet in one town
  a.close(); await srv.stop();
});

test('wilds copies open at the cap; everyone shares the one town', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { copyCap: 1, copyIdleMs: 2000 } });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Copyone'), b = await joinAs(srv, clock, 'Copytwo');
  W.transfer(W.online.get(a.joined.you.char), W.copies[0], { x: W.gate.x, z: W.gate.z }, 'test');
  await run(clock, 100);
  const ob = W.online.get(b.joined.you.char);
  // b walks out of town: copy 1 is full, so a second copy opens
  await walk(clock, b, { x: W.town.x + W.town.r + 12, z: W.town.z + 3 }, srv);
  assert.equal(W.copies.length, 2);
  assert.notEqual(roomOf(srv, a), roomOf(srv, b));
  assert.ok(![...a.mirror.ents.values()].some(e => e.info && e.info.name === 'Copytwo'), 'different copies do not see each other');
  // both walk into the town and see each other there
  await walk(clock, a, { x: W.town.x + 5, z: W.town.z }, srv);
  await walk(clock, b, { x: W.town.x - 5, z: W.town.z }, srv);
  assert.equal(roomOf(srv, a), W.townRoom); assert.equal(roomOf(srv, b), W.townRoom);
  assert.ok(a.mirror.ents.has(b.you) && b.mirror.ents.has(a.you));
  // the empty extra copy closes after copyIdleMs
  await run(clock, 4000);
  assert.equal(W.copies.length, 1);
  void ob;
  a.close(); b.close(); await srv.stop();
});

test('dungeon: a party shares one private instance, an outsider gets their own; stairs, boss, reward chest per character; torn down when empty', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { instanceIdleMs: 3000 } });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Leader'), b = await joinAs(srv, clock, 'Follower'), c = await joinAs(srv, clock, 'Outsider');
  // party up: a invites b
  a.partyOp('invite', { name: 'Follower' });
  let inv = null; b.on('partyInvite', m => { inv = m; });
  await until(clock, () => inv);
  b.partyOp('accept', { party: inv.party });
  await until(clock, () => a.party && a.party.members.length === 2 && b.party);
  // everyone walks to the door (teleport outside for speed) and uses it
  for (const x of [a, b, c]) W.transfer(W.online.get(x.joined.you.char), W.copies[0], { x: W.door.x + 1, z: W.door.z }, 'test');
  await run(clock, 300);
  const doorId = [...W.copies[0].objects.values()].find(o => o.type === 'portal').id;
  for (const x of [a, b, c]) x.use(doorId);
  await run(clock, 300);
  const ra = roomOf(srv, a), rb = roomOf(srv, b), rc = roomOf(srv, c);
  assert.equal(ra.kind, 'instance');
  assert.equal(ra, rb, 'party shares the instance');
  assert.notEqual(ra, rc, 'outsider has their own');
  assert.ok(a.joined.room.dungeon && a.joined.room.dungeon.floors.length === 2, 'client gets the layout');
  assert.equal(a.joined.handoff.via, 'portal');
  assert.ok(a.mirror.ents.has(b.you));
  // take the stairs down
  const stairs = [...ra.objects.values()].find(o => o.type === 'stairs' && o.name === 'Stairs down');
  W.transfer(W.online.get(a.joined.you.char), ra, { x: stairs.x + 1, z: stairs.z }, 'test');
  await run(clock, 200);
  a.use(stairs.id);
  await run(clock, 300);
  const f1 = ra.meta.plan.floors[1].landing || ra.meta.plan.floors[1].entry;      // play-test 6: E's landing = where a floor is arrived on
  assert.ok(Math.hypot(ent(srv, a).x - f1.x, ent(srv, a).z - f1.z) < 1, 'arrived on floor 2');
  // the boss and the mini-bosses are ranked
  const ranks = [...ra.entities.values()].filter(e => e.kind === 'monster').map(e => e.rank);
  assert.ok(ranks.includes('boss') && ranks.includes('elite'));
  // reward chest: each character opens it once
  const chest = [...ra.objects.values()].find(o => o.type === 'chest');
  for (const x of [a, b]) W.transfer(W.online.get(x.joined.you.char), ra, { x: chest.x + 1, z: chest.z }, 'test');
  await run(clock, 300);
  const bagA = a.joined.you.bag.length, goldA = a.joined.you.gold;
  const used = []; a.on('used', u => used.push(u));
  a.use(chest.id); b.use(chest.id);
  await run(clock, 300);
  assert.ok(used[0].ok);
  assert.ok(a.joined.you.bag.length > bagA && a.joined.you.gold > goldA, 'loot + gold');
  assert.ok(b.joined.you.bag.length > 0, 'b got its own loot');
  a.use(chest.id); await run(clock, 300);
  assert.equal(used.at(-1).ok, false); assert.equal(used.at(-1).why, 'opened');
  // the exit takes you back to the door outside
  const exit = [...ra.objects.values()].find(o => o.type === 'exit' && Math.hypot(o.x - chest.x, o.z - chest.z) < 10);
  W.transfer(W.online.get(a.joined.you.char), ra, { x: exit.x, z: exit.z + 1 }, 'test');
  await run(clock, 200);
  a.use(exit.id); await run(clock, 300);
  assert.equal(roomOf(srv, a).kind, 'wilds');
  assert.ok(Math.hypot(ent(srv, a).x - W.door.x, ent(srv, a).z - W.door.z) < 8);
  // b leaves by logging out; the instance closes once empty
  b.leave();
  await run(clock, 500);
  assert.ok(W.instances.has('p' + a.party.id + ':0'));     // one instance per party per door
  await run(clock, 4500);
  assert.ok(!W.instances.has('p' + a.party.id + ':0'), 'torn down when empty');
  assert.ok(W.instances.size === 1, 'the outsider\'s instance is still up');
  a.close(); c.close(); await srv.stop();
});

test('logging out inside an instance and back in: same instance while it lives, else the door outside', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { instanceIdleMs: 2000, lingerMs: 0 } });
  await srv.ready;
  const W = srv.world;
  const { memoryTokenStore } = await import('../../js/net/client.js');
  const tok = memoryTokenStore();
  const a = await joinAs(srv, clock, 'Delver', 'warrior', { tokenStore: tok });
  const charId = a.joined.you.char;
  W.transfer(W.online.get(charId), W.copies[0], { x: W.door.x + 1, z: W.door.z }, 'test');
  await run(clock, 200);
  a.use([...W.copies[0].objects.values()].find(o => o.type === 'portal').id);
  await run(clock, 300);
  const inst = roomOf(srv, a);
  assert.equal(inst.kind, 'instance');
  a.leave(); await run(clock, 300);
  const b = makeClient(srv, clock, { tokenStore: tok });
  await waitP(clock, b.ready);
  await waitP(clock, b.play(charId));
  assert.equal(roomOf(srv, b), inst, 'back in the same instance');
  b.leave(); await run(clock, 3000);                // instance closes
  assert.equal(W.instances.size, 0);
  const c2 = makeClient(srv, clock, { tokenStore: tok });
  await waitP(clock, c2.ready);
  await waitP(clock, c2.play(charId));
  assert.equal(roomOf(srv, c2).kind, 'wilds');
  assert.ok(Math.hypot(ent(srv, c2).x - W.door.x, ent(srv, c2).z - W.door.z) < 8, 'at the door outside');
  c2.close(); await srv.stop();
});
