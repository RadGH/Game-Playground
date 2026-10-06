// Play-test 3, R3 (stream A): "World event 'Grandmother Skein' says 'starting soon' with no time estimate. Events should
// activate when a player goes nearby, not wait in real time (fewer than 5 players at a time); show real time estimates."
//   * a zone event waits armed at its arena; walking up starts a countdown sent as a real time; then the waves;
//     everyone leaving calls it off; after it ends it rests and says when it is ready again
//   * the realm director (E's events.json startOn 'near') never starts a weighted event on its own; a player in band
//     walking up starts it after a countdown; the world boss keeps its fixed schedule and announces the real start time
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirector } from '../../js/sim/director.js';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';

const EV = JSON.parse(readFileSync(new URL('../../data/quests/events.json', import.meta.url), 'utf8'));

test('R3 data: events start near a player with a short countdown; no zone event has a real-time schedule; sized for < 5', () => {
  assert.equal(EV.director.startOn, 'near');
  assert.ok(EV.director.countdownSeconds >= 10 && EV.director.countdownSeconds <= 20);
  assert.ok(EV.director.zone.countdownSeconds >= 10 && EV.director.zone.countdownSeconds <= 20);
  assert.equal(EV.director.size.capPlayers, 5);
  for (const e of EV.zone) { assert.ok(!e.every && !e.warnMinutes, `${e.id}: no clock`); assert.ok(e.cooldownMinutes[1] <= 10); }
  for (const e of EV.realm) assert.ok(e.minOnline <= 1 && e.minInBand <= 1, `${e.id}: one player is enough`);
});

test('R3 zone event (Grandmother Skein): asleep until someone comes near, a 15 s countdown as a real time, then the waves; leaving calls it off; then it rests', async () => {
  const { srv, clock, world } = await realServer();
  const P = world.province, L = world.layouts[0];
  const def = L.zoneEvents.find(e => e.boss === 'event_grandmother_skein') || L.zoneEvents.find(e => e.eid === 'test');
  assert.ok(def, 'the start zone has its event');
  const a = await joinReal(srv, clock, 'Skeinseeker');
  const o = rec(world, a), room = P.copies[0];
  P.devSetLevel(o.char.id, 25);            // the hounds out there must not kill the watcher (a dead body starts nothing)
  const zev = []; a.on('zoneEvent', m => zev.push({ ...m, t: clock.now() }));
  const zones = []; a.on('zone', m => zones.push(m));
  // 400 m away, in the zone: nothing starts however long you wait
  const far = { x: def.x + 400, z: def.z };
  P.transfer(o, room, far, 'test');
  await run(clock, 8000);
  assert.ok(!zev.some(m => m.kind === 'soon' || m.kind === 'start'), 'no event while nobody is near: ' + JSON.stringify(zev.map(m => m.kind)));
  const zm = zones.at(-1);
  assert.ok(zm && Array.isArray(zm.events), 'the zone message lists its events');
  const st = zm.events.find(e => e.id === def.id);
  if (st) assert.equal(st.state, 'ready', 'ready: comes alive when you come near');
  // walk up: the countdown, as a real time (a body the hounds felled starts nothing: stand it up first)
  if (o.entity.dead) o.entity.revive(1);
  P.transfer(o, room, { x: def.x + (def.r || 40) + 20, z: def.z }, 'test');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'soon'), 3000), 'a countdown starts');
  const soon = zev.find(m => m.kind === 'soon');
  assert.ok(soon.inMs >= 10000 && soon.inMs <= 20000, `countdown ${soon.inMs} ms`);
  assert.ok(Math.abs(soon.at - (Date.now() + soon.inMs)) < 120000 || soon.at > 1e12, 'at = a wall-clock time');
  assert.match(soon.text, /\d+ seconds/);
  const states = zev.filter(m => m.kind === 'states').at(-1);
  assert.ok(states && states.list.find(e => e.id === def.id).state === 'soon' && states.list.find(e => e.id === def.id).at, 'the state carries the time');
  // it starts when the countdown runs out (not before)
  await run(clock, soon.inMs - 2500);
  assert.ok(!zev.some(m => m.kind === 'start'), 'not before the countdown ends');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'start'), 5000), 'starts after the countdown');
  const mine = () => [...room.entities.values()].filter(e => e.kind === 'monster' && e.data && String(e.data.event || '').startsWith(def.id) && !e.dead);
  assert.ok(await until(clock, () => mine().length > 0, 5000), 'the first wave comes');
  // the run ends (we kill everything), it rests and says when it is ready again
  for (let k = 0; k < 40 && !zev.some(m => m.kind === 'end'); k++) { for (const m of mine()) m.kill(o.entity); await run(clock, 3000); }
  const end = zev.find(m => m.kind === 'end');
  assert.ok(end && end.next > 0 && end.inMs >= 60000, 'it rests and says until when: ' + JSON.stringify(end && { next: end.next, inMs: end.inMs }));
  a.close(); await srv.stop();
});

test('R3 zone event: everyone walking away during the countdown calls it off', async () => {
  const { srv, clock, world } = await realServer();
  const P = world.province, L = world.layouts[0];
  const def = L.zoneEvents.find(e => e.eid === 'test');
  const a = await joinReal(srv, clock, 'Fickle');
  const o = rec(world, a), room = P.copies[0];
  const zev = []; a.on('zoneEvent', m => zev.push(m));
  P.transfer(o, room, { x: def.x + (def.r || 40) + 10, z: def.z }, 'test');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'soon'), 3000));
  P.transfer(o, room, { x: def.x + 600, z: def.z }, 'test');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'end' && m.called === 'off'), 4000), 'called off');
  await run(clock, 20000);
  assert.ok(!zev.some(m => m.kind === 'start'), 'never started');
  a.close(); await srv.stop();
});

test('R3 director: weighted events never start on a clock; walking up (in band, past the event\'s min level) starts one after a countdown; cooldowns hold; the world boss announces its real time', () => {
  let t = 0, wall = Date.UTC(2026, 9, 5, 10, 0);
  const out = [], sent = [];
  const people = [{ level: 3 }];
  const evs = [
    { id: 'boss', name: 'Boss', province: 'p', x: 0, z: 0, level: 10, schedule: { type: 'fixed', everyHours: 3, atMinute: 30, onDemand: { minInBand: 1, quietMinutes: 60 } }, minOnline: 1, minInBand: 1, weight: 0 },
    { id: 'raid', name: 'Raid', province: 'p', x: 0, z: 0, level: 3, schedule: { type: 'weighted', cooldownMinutes: 60 }, minOnline: 1, minInBand: 1, weight: 3, startOn: { minLevel: 3 } },
  ];
  const d = createDirector({ now: () => t, wallNow: () => wall, events: evs, online: () => people, broadcast: m => out.push(m), procOf: () => 0, sendTo: (p, m) => sent.push(m),
    rules: { ...EV.director, gapMinutes: [10, 20] }, firstMs: 0, rng: () => 0.5 });
  for (let k = 0; k < 120; k++) { t += 30000; d.step(); }
  assert.ok(!out.some(m => m.kind === 'eventSoon' && m.ev.id === 'raid'), 'an hour of nobody near: no raid');
  // a level-2 at the raid: below its min level, nothing
  assert.equal(d.near('raid', [2]), false);
  // a level-3 walks up: a countdown, as a real time
  assert.equal(d.near('raid', [3]), true);
  const soon = out.at(-1);
  assert.equal(soon.kind, 'eventSoon');
  assert.equal(soon.inMs, EV.director.countdownSeconds * 1000);
  assert.equal(soon.at, wall + soon.inMs);
  assert.match(soon.text, /begins in \d+ seconds/);
  t += soon.inMs; d.step();
  assert.equal(out.at(-1).kind, 'eventStart');
  d.onState({ uid: d.current.ev.uid, state: 'won' });
  // right after: the gap and the cooldown hold
  t += 4 * 60000; wall += 4 * 60000;
  assert.equal(d.near('raid', [3]), false, 'cooldown');
  // the world boss: walking up starts it on demand (quiet for an hour) — and its fixed schedule announces the real time
  assert.equal(d.near('boss', [9]), true);
  t += 20000; d.step(); d.onState({ uid: d.current.ev.uid, state: 'won' });
  assert.equal(d.near('boss', [9]), false, 'not again within its quiet hour');
  wall = Date.UTC(2026, 9, 5, 12, 25); t += 40 * 60000; d.step();
  const sched = out.at(-1);
  assert.equal(sched.kind, 'eventSoon'); assert.equal(sched.ev.id, 'boss');
  assert.equal(sched.at, Date.UTC(2026, 9, 5, 12, 30), 'a real start time');
});

test('R3 realm: a level-3 player walking into Torborhold brings the raid (after a countdown); a level-1 does not', async () => {
  const { srv, clock, world } = await realServer();
  const P = world.province, L = world.layouts[0];
  const a = await joinReal(srv, clock, 'Fresh');
  const realm = []; a.on('realm', m => realm.push(m));
  const o = rec(world, a);
  const town = L.towns[0];
  P.transfer(o, P.townRoom, { x: town.x + 3, z: town.z + 3 }, 'test');
  await run(clock, 12000);
  assert.ok(!realm.some(m => m.kind === 'eventSoon'), 'a level-1 in town: no raid');
  P.devSetLevel(o.char.id, 3);
  await run(clock, 7000);
  const soon = realm.find(m => m.kind === 'eventSoon');
  assert.ok(soon, 'a level-3 brings the raid: ' + JSON.stringify(realm.map(m => m.kind)));
  assert.equal(soon.ev.id, 'siege_torborhold');
  assert.ok(soon.inMs > 0 && soon.at > 0);
  assert.ok(await until(clock, () => realm.some(m => m.kind === 'eventStart'), soon.inMs + 5000), 'and it starts');
  a.close(); await srv.stop();
});
