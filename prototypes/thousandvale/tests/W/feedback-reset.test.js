// Feedback #96 (2026-10-21): "/reset" — stuck in a dungeon drawn as the corner of the sea. The first /reset moves you a
// little onto firm ground (in a dungeon: the start of your floor) and sends the room again; a second within two minutes
// takes you home (out of a dungeon: to its door).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotProblem } from '../../js/sim/safe-spot.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { createWorld } from '../../js/sim/world.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { makeClient, run, until, waitP } from '../A/helpers.js';

const root = new URL('../../', import.meta.url);
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));
const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
const T = C.terrain;

test('/reset: a nudge onto firm ground (room sent again), then home; in a dungeon the floor start, then the door', async () => {
  const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: T, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter, horizon: C.horizon, extra: C.extra });
  const clock = createVirtualClock(), store = createMemoryStore({ now: clock.now });
  const world = createWorld({ store, layouts: [L], now: clock.now, lingerMs: 0, log: () => {}, roadEvents: false, travellers: false, events: [], encounterInfo: C.encounterInfo, newcomer: { underLevel: 0, firstMinutes: 0 } });
  const srv = createLoopbackServer({ clock, world }); await srv.ready;
  const c = makeClient(srv, clock, { tokenStore: memoryTokenStore() });
  await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name: 'Stucky', cls: 'warrior' }));
  await waitP(clock, c.play(ch.id)); await until(clock, () => !!c.joined, 8000);
  const replies = []; c.on('unstuckR', m => replies.push(m));
  let joins = 0; c.on('joined', () => joins++);
  const o = world.online.get(ch.id), pv = world.P.get('torbor_downs');
  // outdoors, on good ground away from town
  const door = L.doors[0], at = { x: door.x + 40, z: door.z + 40 };
  world.transfer(o, pv.copies[0], at, 'test'); await run(clock, 500);
  const j0 = joins, p0 = { x: o.entity.x, z: o.entity.z };
  c.unstuck(); await until(clock, () => replies.length === 1, 4000);
  assert.equal(replies[0].ok, true, replies[0].msg);
  const e1 = world.online.get(ch.id).entity;
  const moved = Math.hypot(e1.x - p0.x, e1.z - p0.z);
  assert.ok(moved >= 3 && moved < 60, `nudged a little: ${moved.toFixed(1)} m`);
  assert.equal(spotProblem(T, e1.x, e1.z), null, 'onto good ground');
  await until(clock, () => joins > j0, 4000);
  c.unstuck(); await until(clock, () => replies.length === 2, 4000);
  await run(clock, 500);
  const o2 = world.online.get(ch.id);
  assert.equal(o2.room.kind, 'town', `second /reset takes you home (${replies[1].msg})`);
  // a dungeon: floor start, then out by the door
  const doorObj = [...o2.room.objects.values(), ...pv.copies[0].objects.values()].find(x => x.data?.portal?.to === 'dungeon');
  assert.ok(doorObj, 'a dungeon door');
  world.transfer(o2, pv.copies[0], { x: doorObj.x + 2, z: doorObj.z + 2 }, 'test'); await run(clock, 300);
  c.use(doorObj.id); await until(clock, () => world.online.get(ch.id).room.kind === 'instance', 6000);
  const oi = world.online.get(ch.id);
  oi.entity.moveTo(oi.entity.x + 9, oi.entity.z + 3, undefined, true); await run(clock, 300);
  await run(clock, 11000);      // /reset is rate-limited (protocol: one every 5 s, burst 2)
  c.unstuck(); await until(clock, () => replies.length === 3, 4000);
  assert.equal(world.online.get(ch.id).room.kind, 'instance', replies[2].msg);
  await run(clock, 6000);
  c.unstuck(); await until(clock, () => replies.length === 4, 4000);
  await run(clock, 500);
  const out = world.online.get(ch.id);
  assert.notEqual(out.room.kind, 'instance', 'out of the dungeon');
  assert.ok(Math.hypot(out.entity.x - doorObj.x, out.entity.z - doorObj.z) < 40, 'by its door');
  c.close(); await srv.stop();
});
