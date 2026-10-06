// Events (PLAN §5.2, stream E's data/quests/events.json): the director's picking rules (fixed schedule, head
// counts, weights, cooldowns, reminders), zone events that every copy runs on its own (waves -> boss -> reward),
// and a realm town attack played in the hub town's own room.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirector, nextFixed, eventScale } from '../../js/sim/director.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createWorld } from '../../js/sim/world.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { makeClient, run, until, waitP } from './helpers.js';

const root = new URL('../../', import.meta.url);
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));

test('director: a fixed-schedule event due soon wins; weighted ones need people in band; reminders; cooldowns; sizing', () => {
  let t = 0, wall = Date.UTC(2026, 9, 4, 2, 25);           // 02:25 UTC: Grimtallow (every 3 h at :30 -> 03:30) is 65 min away
  const out = [];
  const people = [];
  const evs = [
    { id: 'boss', name: 'Boss', province: 'p', x: 0, z: 0, level: 10, schedule: { type: 'fixed', everyHours: 3, atMinute: 30 }, minOnline: 1, minInBand: 8, weight: 0, announce: ['soon', 'reminder', 'start'] },
    { id: 'raid', name: 'Raid', province: 'p', x: 0, z: 0, level: 4, schedule: { type: 'weighted', cooldownMinutes: 120 }, minOnline: 4, minInBand: 4, weight: 3, announce: ['raid soon'] },
  ];
  const sent = [];
  const d = createDirector({ now: () => t, wallNow: () => wall, events: evs, online: () => people, broadcast: m => out.push(m), procOf: () => 0, sendTo: (p, m) => sent.push(m), rules: { gapMinutes: [40, 80], announceMinutes: 10, reminderMinutes: [5, 1], size: { healthPerPlayer: 0.12, addWavePerPlayers: 6 } }, firstMs: 0, rng: () => 0.5 });
  assert.equal(nextFixed(evs[0].schedule, wall), Date.UTC(2026, 9, 4, 3, 30));
  people.push({ level: 1 });
  d.step();
  assert.equal(out.length, 0, 'nothing: the boss is not due, the raid needs 4 online in band');
  for (let i = 0; i < 4; i++) people.push({ level: 4 });
  t += 60001; d.step();
  assert.equal(out.at(-1).kind, 'eventSoon'); assert.equal(out.at(-1).ev.id, 'raid'); assert.equal(out.at(-1).text, 'raid soon');
  t += 5 * 60000 + 1; d.step();                              // the 5-minute reminder
  assert.equal(out.filter(m => m.kind === 'eventSoon').length, 2);
  t += 5 * 60000; d.step();
  assert.equal(out.at(-1).kind, 'eventStart');
  assert.deepEqual(d.current.ev.scale, eventScale(5, { healthPerPlayer: 0.12, addWavePerPlayers: 6 }), 'sized to the 5 within 3 levels of it');
  assert.ok(sent.some(m => m.op === 'start') && sent.some(m => m.op === 'live'));
  d.onState({ uid: d.current.ev.uid, state: 'won' });
  assert.equal(out.at(-1).kind, 'eventEnd'); assert.equal(out.at(-1).won, true);
  // the gap, then: the raid is on cooldown (120 min) and the boss is due within 10 min at 03:21
  t += 60 * 60000; wall = Date.UTC(2026, 9, 4, 3, 21); d.step();
  assert.equal(out.at(-1).kind, 'eventSoon'); assert.equal(out.at(-1).ev.id, 'boss', 'the fixed schedule wins even with 1 in band');
  assert.equal(out.at(-1).at, Date.UTC(2026, 9, 4, 3, 30));
});

test('zone events: every copy runs its own (waves, then the boss), the zone hears it, the enrolled are paid', async () => {
  const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
  const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter });
  assert.equal(L.zoneEvents.length, 16, 'one zone event per zone');
  const def = L.zoneEvents.find(e => e.eid === 'test');
  assert.ok(def && def.waves.length >= 2 && def.boss);
  // the zone event boss is not a camp that stands there all the time
  assert.ok(!L.camps.some(c => c.encounter === def.boss), 'the event boss only comes with its event');
  const clock = createVirtualClock();
  const world = createWorld({ layouts: [L], store: createMemoryStore({ now: clock.now }), now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, zoneEventFirstMs: 2000, zoneEventGapMs: 3600000 });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  const a = makeClient(srv, clock);
  await waitP(clock, a.ready);
  await waitP(clock, a.play((await waitP(clock, a.createChar({ name: 'Warden', cls: 'warrior' }))).id));
  const P = world.province, room = P.copies[0];
  const me = () => P.online.get(a.joined.you.char);
  const zev = [], frames = []; a.on('zoneEvent', m => zev.push(m)); a.on('eventFrame', m => frames.push(m));
  P.transfer(me(), room, { x: def.x + def.r * 0.5, z: def.z }, 'test');
  await run(clock, 4000);
  const startMsg = zev.find(m => m.kind === 'soon' || m.kind === 'start');
  assert.ok(startMsg, 'the zone hears its event: ' + JSON.stringify(zev));
  assert.equal(startMsg.ev.id, def.id);
  await run(clock, (def.countdownMs ?? def.warnMs ?? 0) + 2000);     // R3: the countdown starts when someone comes near
  const mine = () => [...room.entities.values()].filter(e => e.kind === 'monster' && e.data && e.data.event && String(e.data.event).startsWith(def.id) && !e.dead);
  for (let w = 0; w < def.waves.length; w++) {
    assert.ok(await until(clock, () => mine().length > 0, 10000), 'wave ' + (w + 1) + ' arrives');
    assert.ok(mine().every(m => m.rank !== 'boss'));
    for (const m of mine()) m.kill(me().entity);
    await run(clock, 6000);
  }
  assert.ok(await until(clock, () => mine().some(m => m.rank === 'boss'), 10000), 'then the boss');
  assert.ok(frames.length && frames.at(-1).players >= 1 && frames.at(-1).phase === 'boss');
  const xp0 = me().char.xp || 0, gold0 = me().char.gold || 0;
  for (const m of mine()) m.kill(me().entity);
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'end'), 5000));
  assert.equal(zev.find(m => m.kind === 'end').won, true);
  await run(clock, 500);
  assert.ok((me().char.xp || 0) > xp0 && (me().char.gold || 0) > gold0, 'paid');
  a.close(); await srv.stop();
});

test('realm town attack: raiders come into the hub town\'s own room; free travel lands inside the town', async () => {
  const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
  const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter });
  const siege = C.events.find(e => e.kind === 'town_attack');
  assert.ok(siege, 'events.json has a town attack in this province');
  const clock = createVirtualClock();
  const world = createWorld({ layouts: [L], store: createMemoryStore({ now: clock.now }), now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, zoneEventFirstMs: 1e9 });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  const a = makeClient(srv, clock);
  await waitP(clock, a.ready);
  await waitP(clock, a.play((await waitP(clock, a.createChar({ name: 'Sentry', cls: 'warrior' }))).id));
  const P = world.province;
  const town = P.townRoom;
  assert.ok(Math.hypot(siege.x - L.towns[0].x, siege.z - L.towns[0].z) < L.towns[0].r, 'the raid is on Torborhold');
  assert.ok(world.director.force(siege.id, { announce: 0 }));
  await run(clock, 2500);
  const raiders = () => [...town.entities.values()].filter(e => e.kind === 'monster' && e.data && e.data.event);
  assert.ok(raiders().length >= 4, 'raiders in the town room: ' + raiders().length);
  // someone out in the wilds takes the free travel: it lands them in the town room, in the fight
  const me = () => P.online.get(a.joined.you.char);
  // a quiet spot ~600 m out (no camp within 150 m: a fight cancels the travel, and E's camps move with every placement run)
  let spot = { x: L.towns[0].x + 600, z: L.towns[0].z };
  for (let k = 0; k < 64; k++) { const a2 = k / 64 * Math.PI * 2, p = { x: L.towns[0].x + Math.cos(a2) * 600, z: L.towns[0].z + Math.sin(a2) * 600 }; if ((!L.terrain.walkable || L.terrain.walkable(p.x, p.z)) && !L.camps.some(c => Math.hypot(c.x - p.x, c.z - p.z) < 150) && !L.towns.some(t => Math.hypot(t.x - p.x, t.z - p.z) < t.r + 20)) { spot = p; break; } }
  P.transfer(me(), P.copies[0], spot, 'test');
  await run(clock, 300);
  const tr = []; a.on('travelR', m => tr.push(m));
  a.travel('event');
  assert.ok(await until(clock, () => tr.length && me().room === town, 5000), 'travelled into the town: ' + JSON.stringify(tr));
  assert.equal(tr[0].cost, 0);
  a.close(); await srv.stop();
});
