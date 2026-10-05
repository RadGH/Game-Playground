// M3 the province world boss as a realm event: Grimtallow, the Siege-Husk (stream E's events.json + encounter).
// The director's on-demand rule, its cooldown kept in world_state across a restart, the boss breaking out to a
// neighbouring arena; credit by contribution (idle onlookers earn nothing), a world cache only contributors open,
// the first kill of the day rolling one extra reward and remembered on the character.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirector, onDemandOf } from '../../js/sim/director.js';
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

test('on demand: E\'s prose rule parses; 12 in band + quiet 90 min starts it; the cooldown survives a restart', async () => {
  const od = onDemandOf({ type: 'fixed', also: 'on demand when >= 12 characters in band are online and none ran in the last 90 minutes' });
  assert.deepEqual(od, { minInBand: 12, quietMs: 90 * 60000 });
  assert.deepEqual(onDemandOf({ onDemand: { minInBand: 3, quietMinutes: 5 } }), { minInBand: 3, quietMs: 300000 });
  assert.equal(onDemandOf({ type: 'fixed' }), null);
  let t = 0, wall = Date.UTC(2026, 9, 4, 4, 0);       // 04:00 — the fixed 03:30/06:30 slots are not near
  const store = createMemoryStore({ now: () => wall });
  const people = [];
  const ev = { id: 'world_grimtallow', name: 'Grimtallow', province: 'p', x: 0, z: 0, level: 10, kind: 'worldboss', schedule: { type: 'fixed', everyHours: 3, atMinute: 30, also: 'on demand when >= 12 characters in band are online and none ran in the last 90 minutes' }, minOnline: 1, minInBand: 8, weight: 0, announce: ['soon'] };
  const make = out => createDirector({ now: () => t, wallNow: () => wall, events: [ev], online: () => people, broadcast: m => out.push(m), procOf: () => 0, sendTo: () => {}, firstMs: 0, announceMs: 10 * 60000, rng: () => 0.99,
    persist: { load: () => store.getWorld('director'), save: v => store.setWorld('director', v) } });
  const out = [];
  let d = make(out);
  await new Promise(r => setImmediate(r));
  for (let i = 0; i < 11; i++) people.push({ level: 10, online: true });
  d.step();
  assert.equal(d.current, null, '11 in band: not yet');
  people.push({ level: 9, online: true });
  t += 60000; d.step();
  assert.equal(d.current && d.current.ev.id, 'world_grimtallow', 'on demand with 12 in band');
  t += 10 * 60000; wall += 10 * 60000; d.step();
  assert.equal(d.current.state, 'live');
  assert.ok((await store.getWorld('director')).lastRun.world_grimtallow, 'saved to world_state');
  // a restart 20 minutes later: the new director remembers, so it does not run again on demand
  wall += 20 * 60000; t = 0;
  const out2 = [];
  d = make(out2);
  await new Promise(r => setImmediate(r));
  t += 60000; d.step();
  assert.equal(d.current, null, 'quiet time not over after a restart');
  wall += 80 * 60000; t += 60000;
  // (06:30 fixed slot is now inside the window too; either way it is the boss again)
  d.step();
  assert.equal(d.current && d.current.ev.id, 'world_grimtallow');
});

test('roam: sometimes Grimtallow breaks out and marches on a neighbouring arena; the announcement says where', () => {
  const t = 0, wall = Date.UTC(2026, 9, 4, 3, 25);
  const out = [];
  const ev = { id: 'wb', name: 'Grimtallow', province: 'p', x: 0, z: 0, r: 100, level: 10, kind: 'worldboss', schedule: { type: 'fixed', everyHours: 3, atMinute: 30 }, minOnline: 1, weight: 0, announce: ['It stirs.'], roam: { chance: 0.25 }, roamTo: [{ zone: 'z12_04', zoneName: 'Coldwater Mere', x: 500, z: 600, r: 40 }] };
  const d = createDirector({ now: () => t, wallNow: () => wall, events: [ev], online: () => [{ level: 10, online: true }], broadcast: m => out.push(m), procOf: () => 0, sendTo: () => {}, firstMs: 0, rng: () => 0.1 });
  d.step();
  assert.equal(d.current.ev.x, 500); assert.equal(d.current.ev.zoneName, 'Coldwater Mere'); assert.equal(d.current.ev.roamed, true);
  assert.match(out[0].text, /It stirs\. Grimtallow has broken out and marches on Coldwater Mere!/);
  assert.equal(out[0].ev.roamed, true);
});

test('Grimtallow in Torbor Downs: credit by contribution, a cache only contributors open, the first kill of the day', async () => {
  const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
  const wb = C.events.find(e => e.id === 'world_grimtallow');
  assert.ok(wb, 'Grimtallow is a realm event of this province');
  assert.equal(wb.kind, 'worldboss'); assert.ok(wb.roamTo.length >= 1, 'with somewhere to roam to');
  const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter });
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const world = createWorld({ layouts: [L], store, now: clock.now, lingerMs: 0, log: () => {}, events: C.events.map(e => (e.id === wb.id ? { ...e, roamTo: [] } : e)), encounterInfo: C.encounterInfo, zoneEventFirstMs: 1e9 });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  const join = async n => { const c = makeClient(srv, clock); await waitP(clock, c.ready); await waitP(clock, c.play((await waitP(clock, c.createChar({ name: n, cls: 'warrior' }))).id)); return c; };
  const fighter = await join('Fighter'), idler = await join('Idler');
  const P = world.province;
  const me = c => P.online.get(c.joined.you.char);
  assert.ok(world.director.force(wb.id, { announce: 0 }));
  await run(clock, 2500);
  const room = P.copies[0];
  P.transfer(me(fighter), room, { x: wb.x + 10, z: wb.z }, 'test');
  P.transfer(me(idler), room, { x: wb.x - 10, z: wb.z }, 'test');
  await run(clock, 3000);
  const boss = () => [...room.entities.values()].find(e => e.kind === 'monster' && e.rank === 'boss' && e.data && e.data.event && String(e.data.event).startsWith(wb.id));
  assert.ok(await until(clock, () => boss(), 15000), 'Grimtallow walks');
  assert.equal(boss().data.encounter, 'world_grimtallow');
  const xp0 = { f: me(fighter).char.xp || 0, i: me(idler).char.xp || 0 };
  boss().kill(me(fighter).entity);
  await run(clock, 3000);
  assert.ok((me(fighter).char.xp || 0) > xp0.f, 'the fighter is paid');
  assert.equal(P.counters.eventPaid, 1, 'an idle onlooker is not (kill XP shared by the rules is another matter)');
  assert.ok(!(me(idler).char.daily || {})['wb:world_grimtallow']);
  const day = Math.floor(Date.now() / 86400000);     // this world's wall clock is the real one
  assert.equal(me(fighter).char.daily['wb:world_grimtallow'], day, 'first kill of the day remembered');
  // the world cache: only the fighter can open it
  const cache = [...room.objects.values()].find(o => o.name === 'World cache');
  assert.ok(cache, 'a world cache stands in the arena');
  const ui = [], uf = [];
  idler.on('used', m => ui.push(m)); fighter.on('used', m => uf.push(m));
  P.transfer(me(idler), room, { x: cache.x + 1, z: cache.z }, 'test');
  P.transfer(me(fighter), room, { x: cache.x - 1, z: cache.z }, 'test');
  await run(clock, 300);
  idler.use(cache.id); fighter.use(cache.id);
  await until(clock, () => ui.length && uf.length);
  assert.equal(ui[0].ok, false); assert.equal(ui[0].why, 'locked');
  assert.equal(uf[0].ok, true, JSON.stringify(uf[0]));
  await run(clock, 1100);
  fighter.use(cache.id); await until(clock, () => uf.length >= 2);
  assert.equal(uf[1].ok, false, 'once');
  // the daily mark is saved with the character
  await P.saveNow(me(fighter));
  assert.equal(store.data.chars[fighter.joined.you.char].blob.daily['wb:world_grimtallow'], day);
  fighter.close(); idler.close(); await srv.stop();
});
