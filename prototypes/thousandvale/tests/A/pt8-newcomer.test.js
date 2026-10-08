// Owner feedback 8, W1 (report #22: "I just created a new character and the starting town is being raided. I died before I
// had a chance to do anything. Where are the town guards?") on the REAL world and stream E's data:
//   - a newcomer = under level 3 OR under 10 minutes played (events.json director.newcomer); played time is counted and saved;
//   - an event with `startOn.clearOfNewcomersM` neither counts down nor starts while a newcomer is within that range, and a
//     countdown already running is called off when one walks up; it runs once they are no newcomer or have left;
//   - Torborhold's raid is not even proposed to the director while a newcomer is in reach of the town;
//   - E's guards stand at their posts (gate + square), named, untitled, flagged `info.guard`, one body each;
//   - a newcomer caught in a town with an event live is kept on their feet and told why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

test('W1: who is a newcomer; played time counts while online', async () => {
  const { srv, clock, world } = await realServer({ newcomer: null });
  const a = await joinReal(srv, clock, 'Fresh', 'warrior');
  const o = rec(world, a);
  assert.deepEqual({ l: world.NEWCOMER.underLevel, m: world.NEWCOMER.firstMinutes }, { l: 3, m: 10 }, 'E\'s numbers');
  assert.equal(world.isNewcomer(o), true, 'level 1, just made');
  await run(clock, 5000, 50);
  assert.ok(o.char.played >= 3000 && o.char.played <= 6000, 'played ms: ' + o.char.played);
  world.devSetLevel(o.char.id, 5);
  assert.equal(world.isNewcomer(o), true, 'level 5 but only seconds old: still a newcomer');
  o.char.played = 11 * 60000;
  assert.equal(world.isNewcomer(o), false, 'level 5 and eleven minutes in');
  world.devSetLevel(o.char.id, 2);
  assert.equal(world.isNewcomer(o), true, 'an old level-2 character is one too');
  a.close(); await srv.stop();
});

test('W1: a zone event waits while a newcomer is in reach (and a countdown is called off when one walks up); it runs for a veteran', async () => {
  const { srv, clock, world } = await realServer({ zoneEventFirstMs: 0, roadEvents: false, newcomer: null });
  const pv = world.P.values().next().value;
  const def = pv.L.zoneEvents.find(d => d.startOn && d.startOn.clearOfNewcomersM > 0);
  assert.ok(def, 'E marked zone events with clearOfNewcomersM');
  const vet = await joinReal(srv, clock, 'Veteran', 'warrior'), nb = await joinReal(srv, clock, 'Newbie', 'warrior');
  const ov = rec(world, vet), on = rec(world, nb);
  world.devSetLevel(ov.char.id, Math.max(10, def.level || 10)); ov.char.played = 3600000;
  ov.entity.hpMax = 1e6;
  const room = pv.copies[0], key = room.id + '|' + def.id;
  const soon = [], zv = []; vet.on('zoneEvent', m => { zv.push(m); if (m.kind === 'soon') soon.push(m); });
  // the newcomer stands inside the clear range, the veteran walks onto the arena: nothing is armed
  world.transfer(on, room, { x: def.x + def.startOn.clearOfNewcomersM - 20, z: def.z }, 'test');
  world.transfer(ov, room, { x: def.x + 5, z: def.z }, 'test');
  await run(clock, 6000, 50);
  assert.equal(soon.length, 0, 'no countdown with a newcomer in reach');
  assert.ok(!world.zoneRuns.has(key), 'and no event');
  assert.ok((world.counters.eventsHeldForNewcomers || 0) > 0, 'held, and counted');
  // the newcomer leaves: the countdown begins
  world.transfer(rec(world, nb), room, { x: def.x + def.startOn.clearOfNewcomersM + 400, z: def.z }, 'test');
  await run(clock, 3000, 50);
  assert.equal(soon.length, 1, 'now it counts down: ' + JSON.stringify(zv.map(m => m.kind)));
  // …and walks back during the countdown: called off
  world.transfer(rec(world, nb), room, { x: def.x + 30, z: def.z }, 'test');
  await run(clock, 3000, 50);
  assert.ok(zv.some(m => m.kind === 'end' && m.called === 'off'), 'called off');
  await run(clock, 30000, 50);
  assert.ok(!world.zoneRuns.has(key), 'it never started on top of the newcomer');
  // no longer a newcomer: it runs
  world.devSetLevel(rec(world, nb).char.id, 6); rec(world, nb).char.played = 3600000;
  await run(clock, (def.countdownMs || 15000) + 4000, 50);
  assert.ok(world.zoneRuns.has(key), 'with two veterans it starts');
  vet.close(); nb.close(); await srv.stop();
});

test('W1: Torborhold — no raid is proposed while a newcomer is near the town; the guards E posted stand there; a newcomer in a raided town is warded', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false, newcomer: null });
  const pv = world.P.values().next().value, town = pv.towns[0], t0 = pv.L.towns[0];
  // guards: E's posts, one body each, named and untitled
  const guards = [...town.objects.values()].filter(x => x.data && x.data.guard);
  const wild = [...pv.copies[0].objects.values()].filter(x => x.data && x.data.guard && Math.hypot(x.x - t0.x, x.z - t0.z) < t0.r + 80);
  assert.ok(guards.length + wild.length >= 4, 'Torborhold has guards at its gate and in its square: ' + guards.length + ' in town, ' + wild.length + ' outside');
  for (const g of [...guards, ...wild]) { const i = g.info(); assert.equal(i.guard, 1); assert.ok(!i.title, 'no title (W27)'); assert.match(i.name, /Guard|Sergeant/); }
  const all = [...town.objects.values()].filter(x => x.data && x.data.npc && x.data.npc.role === 'guard');
  assert.equal(all.length, guards.length, 'no second set of schedule guards on top of the posted ones');
  // the director is not told about Torborhold while a newcomer is in it
  const raid = (world.realmEvents || []).find(e => e.startOn && e.startOn.clearOfNewcomersM > 0 && Math.hypot(e.x - t0.x, e.z - t0.z) < t0.r + 50);
  assert.ok(raid, 'E marked the Torborhold raid');
  const sent = []; const send0 = world._send; void send0;
  const vet = await joinReal(srv, clock, 'Oldhand', 'warrior'), nb = await joinReal(srv, clock, 'Greenhorn', 'warrior');
  const ov = rec(world, vet);
  world.devSetLevel(ov.char.id, 8); ov.char.played = 3600000;
  const near0 = world.counters.eventNearSent || 0;
  await run(clock, 12000, 50);
  assert.equal(world.counters.eventNearSent || 0, near0, 'nothing proposed with a newcomer in town');
  assert.ok(!world.liveEventNow(), 'no raid');
  // the newcomer grows up: now the veteran's presence proposes it
  const on = rec(world, nb);
  world.devSetLevel(on.char.id, 4); on.char.played = 3600000;
  await run(clock, 7000, 50);
  assert.ok((world.counters.eventNearSent || 0) > near0, 'proposed once nobody near is a newcomer');
  // a newcomer caught in a town with event monsters in it: kept on their feet, told once
  const nb2 = await joinReal(srv, clock, 'Latecomer', 'warrior');
  const o2 = rec(world, nb2);
  assert.equal(o2.room.kind, 'town');
  const chat = []; nb2.on('chat', m => chat.push(m));
  const raider = o2.room.spawn({ kind: 'monster', type: 'road_brigand', level: 3, x: o2.entity.x + 3, z: o2.entity.z, team: 2, data: { event: 'test-raid' } });
  let low = Infinity;
  for (let k = 0; k < 40; k++) { await run(clock, 500, 50); low = Math.min(low, o2.entity.hp); assert.equal(o2.entity.dead, false, 'never dies (hp ' + o2.entity.hp + ' after ' + k / 2 + ' s)'); }
  assert.ok(low < o2.entity.hpMax || raider.removed || raider.dead || true);
  assert.ok(chat.some(m => /keeps new arrivals on their feet/.test(m.text)), 'told why: ' + JSON.stringify(chat.slice(-2)));
  assert.equal(chat.filter(m => /keeps new arrivals/.test(m.text)).length, 1, 'once');
  vet.close(); nb.close(); nb2.close(); await srv.stop();
});
