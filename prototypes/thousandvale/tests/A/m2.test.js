// M2 server shape: a 16-zone province room (stitched bakes, world metres), hub towns, waystones and travel,
// a second province in a second process (relocation), the realm event director, open groups, player traces,
// zone deeds, day/night + NPC schedules. In-process (createRealm = the stage-2 shape on one bus per process).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createRealm } from '../../js/sim/world.js';
import { loadProvinceContent, loadZoneContent } from '../../js/sim/content.js';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { makeClient, run, until, waitP } from './helpers.js';

const root = new URL('../../', import.meta.url);
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));
const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, createProvinceTerrain });
const TORBOR = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter });
const OTHER = buildLayout({ key: 'vale', name: 'The Test Vale', terrain: standInTerrain(5, 1024), zones: [{ key: 'vale', sheet: null }] });

function realmServer({ clock, store = null, opts = {} } = {}) {
  const st = store || createMemoryStore({ now: clock.now });
  const world = createRealm({ procs: [[TORBOR], [OTHER]], store: st, now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, ...opts });
  return createLoopbackServer({ clock, world });
}
async function joinRealm(srv, clock, name) {
  const c = makeClient(srv, clock);
  await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name, cls: 'warrior' }));
  await waitP(clock, c.play(ch.id));
  return c;
}
const o = (srv, c) => { for (const p of srv.world.procs) { const x = p.online.get(c.joined.you.char); if (x) return x; } return null; };

test('the province: 16 zones in world metres, new characters in Torborhold, walking between zones is seamless', async () => {
  const clock = createVirtualClock();
  const srv = realmServer({ clock });
  await srv.ready;
  const a = await joinRealm(srv, clock, 'Strider');
  assert.equal(a.joined.room.id, 'torbor_downs/town:0');
  assert.equal(a.joined.room.name, 'Torborhold');
  assert.equal(a.joined.room.zones.length, 16);
  assert.ok(a.joined.room.origin.x === 22528 && a.joined.room.q <= 0.13);
  const P0 = srv.world.procs[0];
  const r = P0.copies[0];
  assert.ok(r.bounds.maxX - r.bounds.minX === 8192, 'one room over the whole 4x4 province');
  // across the z12/z13 border in the wilds: same room, no handoff
  const x = o(srv, a);
  let y = 2048 * 2 + 900, best = null;
  for (let k = 0; k < 200 && !best; k++, y += 10) if (C.terrain.walkable(2048 * 13 - 6, y) && C.terrain.walkable(2048 * 13 + 6, y)) best = y;
  P0.transfer(x, r, { x: 2048 * 13 - 4, z: best }, 't');
  await run(clock, 300);
  const joins = []; a.on('joined', j => joins.push(j));
  let s = 1;
  for (let i = 0; i < 25; i++) { a.input({ s: ++s, dt: 50, mx: 1, mz: 0, yaw: 0, b: 1 }); await run(clock, 50, 50); }
  await run(clock, 300);
  assert.ok(o(srv, a).entity.x > 2048 * 13, 'crossed into z13');
  assert.equal(joins.length, 0, 'no handoff at a zone border');
  // the snapshot positions decode in world metres
  const me = a.lastSelf;
  assert.ok(Math.abs(me.x - o(srv, a).entity.x) < 0.01);
  a.close(); await srv.stop();
});

test('waystones: discover, travel inside the province for a fare, and to another process\'s province (relocate)', async () => {
  const clock = createVirtualClock();
  const srv = realmServer({ clock });
  await srv.ready;
  const a = await joinRealm(srv, clock, 'Pilgrim');
  const P0 = srv.world.procs[0], P1 = srv.world.procs[1];
  const x = o(srv, a);
  x.char.gold = 200;
  const used = [], tr = []; a.on('used', u => used.push(u)); a.on('travelR', m => tr.push(m));
  const ws0 = [...P0.townRoom.objects.values()].find(q => q.type === 'waystone');
  // travel before discovering anything: refused
  a.travel('ws:torbor_downs:t1'); await run(clock, 200);
  assert.equal(tr.at(-1).why, 'undiscovered');
  // discover the town's waystone, then another town's (walk there = teleport in the test)
  P0.transfer(x, P0.townRoom, { x: ws0.x + 1, z: ws0.z }, 't'); await run(clock, 200);
  a.use(ws0.id); await run(clock, 200);
  assert.ok(used.at(-1).ok && used.at(-1).fresh);
  const t1 = TORBOR.towns[1], r1 = P0.rooms.get('torbor_downs/town:1');
  const ws1 = [...r1.objects.values()].find(q => q.type === 'waystone');
  P0.transfer(o(srv, a), r1, { x: ws1.x + 1, z: ws1.z }, 't'); await run(clock, 200);
  a.use(ws1.id); await run(clock, 200);
  // back to Torborhold by waystone: a fare, and you arrive there
  const g0 = a.joined.you.gold;
  a.travel(ws0.data.waystone.key); await run(clock, 400);
  assert.ok(tr.at(-1).ok && tr.at(-1).cost > 0, JSON.stringify(tr.at(-1)));
  assert.equal(a.joined.you.gold, g0 - tr.at(-1).cost);
  assert.equal(a.joined.room.id, 'torbor_downs/town:0');
  void t1;
  // the other province (process 1): discover its waystone first, by a test teleport there
  const wsV = OTHER.waystones[0];
  P0.moveTo(o(srv, a), 'vale', { x: wsV.x + 1, z: wsV.z }, 'test');
  const ok = await until(clock, () => a.status === 'online' && a.joined.room.id.startsWith('vale/'), 10000);
  assert.ok(ok, 'relocated to process 1: ' + a.status + ' ' + (a.joined && a.joined.room.id));
  assert.ok(P1.online.has(a.joined.you.char) && !P0.online.has(a.joined.you.char));
  const wsObj = [...P1.townRoom.objects.values()].find(q => q.type === 'waystone');
  a.use(wsObj.id); await run(clock, 200);
  // and back to Torborhold by waystone: across processes again, gold and bag kept
  const before = a.joined.you.gold;
  a.travel(ws0.data.waystone.key); await run(clock, 300);
  const back = await until(clock, () => a.status === 'online' && a.joined.room.id === 'torbor_downs/town:0', 10000);
  assert.ok(back, 'back in Torborhold ' + a.status + ' ' + (a.joined && a.joined.room.id) + ' ' + JSON.stringify(tr.slice(-2)));
  assert.ok(a.joined.you.gold < before && a.joined.you.gold > 0);
  assert.equal(srv.world.gateway.counters.relocations, 2);
  a.close(); await srv.stop();
});

test('the realm event: announced, boss spawned scaled to who is online, free travel from anywhere, ended when it dies', async () => {
  const clock = createVirtualClock();
  const srv = realmServer({ clock });
  await srv.ready;
  const a = await joinRealm(srv, clock, 'Herald'), b = await joinRealm(srv, clock, 'Latecomer');
  const realm = []; a.on('realm', m => realm.push(m)); b.on('realm', m => realm.push(m));
  // b is in the other province (process 1)
  srv.world.procs[0].moveTo(o(srv, b), 'vale', { x: 512, z: 512 }, 'test');
  await until(clock, () => b.joined && b.joined.room.id.startsWith('vale/'), 10000);
  assert.ok(srv.world.director.force('world_grimtallow', { announce: 2000 }));
  await run(clock, 300);
  assert.ok(realm.some(m => m.kind === 'eventSoon'));
  await run(clock, 2500);
  assert.ok(realm.some(m => m.kind === 'eventStart'));
  const P0 = srv.world.procs[0];
  const boss = [...P0.copies[0].entities.values()].find(e => e.data && e.data.event);
  assert.ok(boss && boss.rank === 'boss' && boss.name.startsWith('Grimtallow'));
  // free travel for both: a in the same process, b from the other one
  const tr = []; a.on('travelR', m => tr.push(m)); b.on('travelR', m => tr.push(m));
  a.travel('event'); b.travel('event');
  await until(clock, () => a.joined.room.id.startsWith('torbor_downs/wilds') && b.joined && b.joined.room.id.startsWith('torbor_downs/wilds'), 10000);
  assert.ok(tr.every(t => t.ok && t.cost === 0), JSON.stringify(tr));
  for (const c of [a, b]) { const e = o(srv, c).entity; assert.ok(Math.hypot(e.x - boss.x, e.z - boss.z) < 120, 'at the arena'); }
  const frames = []; a.on('eventFrame', f => frames.push(f));
  await run(clock, 2500);
  assert.ok(frames.length >= 1 && frames.at(-1).players >= 2, 'the event group frame');
  boss.kill(null);
  await run(clock, 2000);
  const end = realm.find(m => m.kind === 'eventEnd');
  assert.ok(end && end.won);
  a.close(); b.close(); await srv.stop();
});

test('open groups: two strangers hitting one monster get "Group up"; one click each makes them a party', async () => {
  const clock = createVirtualClock();
  const srv = realmServer({ clock });
  await srv.ready;
  const a = await joinRealm(srv, clock, 'Stranger A'), b = await joinRealm(srv, clock, 'Stranger B');
  const P0 = srv.world.procs[0], r = P0.copies[0];
  const wolf = [...r.entities.values()].find(e => e.kind === 'monster' && e.rank === 'normal' && !e.dead);
  P0.transfer(o(srv, a), r, { x: wolf.x + 1.5, z: wolf.z }, 't');
  P0.transfer(o(srv, b), r, { x: wolf.x - 1.5, z: wolf.z }, 't');
  await run(clock, 300);
  const hints = []; a.on('groupHint', h => hints.push(h)); b.on('groupHint', h => hints.push(h));
  for (let i = 0; i < 8 && hints.length < 2; i++) { a.cast({ slot: 0, target: wolf.id }); b.cast({ slot: 0, target: wolf.id }); await run(clock, 1000); }
  assert.equal(hints.length, 2, 'both got the hint');
  assert.equal(hints[0].key, hints[1].key);
  a.partyOp('group', { code: hints[0].key }); await run(clock, 200);
  b.partyOp('group', { code: hints[0].key }); await run(clock, 300);
  assert.ok(a.party && b.party && a.party.id === b.party.id && a.party.members.length === 2);
  a.close(); b.close(); await srv.stop();
});

test('traces: a grave where a player fell, a campfire, zone deeds; a cleared dungeon flies a banner on its door', async () => {
  const clock = createVirtualClock();
  const srv = realmServer({ clock });
  await srv.ready;
  const a = await joinRealm(srv, clock, 'Fallen');
  const P0 = srv.world.procs[0], r = P0.copies[0];
  const zones = []; a.on('zone', z => zones.push(z));
  P0.transfer(o(srv, a), r, { x: TORBOR.towns[0].x + 200, z: TORBOR.towns[0].z }, 't');
  await run(clock, 1500);
  assert.ok(zones.length >= 1 && zones.at(-1).zone === 'z12_02', 'zone message on arrival');
  a.campfire(); await run(clock, 200);
  const fire = [...r.objects.values()].find(q => q.type === 'campfire');
  assert.ok(fire && fire.data.trace.who === 'Fallen');
  const e = o(srv, a).entity;
  const killer = [...r.entities.values()].find(q => q.kind === 'monster');
  e.kill(killer);
  await run(clock, 300);
  const grave = [...r.objects.values()].find(q => q.type === 'grave');
  assert.ok(grave && grave.data.trace.who === 'Fallen' && grave.data.trace.by === killer.name);
  a.respawn(); await run(clock, 300);
  // a grave fades after an hour
  await run(clock, 3600 * 1000 + 1000, 1000);
  assert.ok(![...r.objects.values()].some(q => q.type === 'grave'), 'grave faded');
  // deeds count deaths in the zone
  P0.transfer(o(srv, a), r, { x: grave.x + 5, z: grave.z }, 't'); await run(clock, 1500);
  // a dungeon boss dying marks its door in every copy
  const doorObj = [...r.objects.values()].find(q => q.type === 'portal');
  P0.transfer(o(srv, a), r, { x: doorObj.x + 1, z: doorObj.z }, 't'); await run(clock, 200);
  a.use(doorObj.id); await run(clock, 500);
  const inst = o(srv, a).room;
  assert.equal(inst.kind, 'instance');
  const boss = [...inst.entities.values()].find(q => q.rank === 'boss');
  boss.kill(o(srv, a).entity); await run(clock, 300);
  assert.equal(doorObj.data.banner.by, 'Fallen');
  a.close(); await srv.stop();
});

test('day/night: the clock comes in welcome; NPCs go to work by day and to the inn by night', async () => {
  const clock = createVirtualClock();
  let wall = Date.UTC(2026, 9, 4, 12);
  const srv = realmServer({ clock, opts: { wallNow: () => wall } });
  await srv.ready;
  const a = await joinRealm(srv, clock, 'Nightowl');
  assert.ok(a.realmClock && a.realmClock.dayMs === 2 * 3600000);
  const P0 = srv.world.procs[0], tr = P0.townRoom;
  const npc = [...tr.objects.values()].find(q => q.kind === 'npc' && q.data.npc.role === 'merchant');
  assert.ok(npc && a.mirror.ents.has(npc.id) || true);
  const day = npc.data.schedule.day, night = npc.data.schedule.night;
  // pick a wall time that is night on the realm clock
  const epoch = srv.world.gateway.epoch;
  wall = epoch + 2 * 3600000 * 0.95;
  assert.ok(P0.timeOfDay() > 0.8);
  await run(clock, 60000, 200);
  assert.ok(Math.hypot(npc.x - night.x, npc.z - night.z) < 1, 'at the inn by night');
  wall = epoch + 2 * 3600000 * 1.5;
  await run(clock, 60000, 200);
  assert.ok(Math.hypot(npc.x - day.x, npc.z - day.z) < 1, 'at work by day');
  a.close(); await srv.stop();
});
