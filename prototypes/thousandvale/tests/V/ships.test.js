// Stream V (Expansion 1 §6): the voyage between the continents. js/sim/ships.js rules on stubs (fare, hold, refund when
// cut short, "not sailing yet" when the far province is not loaded, a party boarding together, skipping, the logbook and
// the quest event), the data (every sea route stays on deep water, every berth has water under it), and the REAL Torbor
// Downs world: the Harbourmaster stands in Gullwick, talks, lists the sailing — and, with Vharlen not loaded in this
// realm, says the ship is not sailing yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShips, placeHarbours, harbourObjects } from '../../js/sim/ships.js';
import { parseHorizon } from '../../js/rules/horizon-read.js';
import { pathMetres } from '../../tools/ship-routes.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = JSON.parse(readFileSync(join(GAME, 'data/provinces/ships.json'), 'utf8'));

/** A tiny world of stubs: characters, a clock in ticks, everything ships.js calls recorded. */
function rig({ loaded = ['torbor_downs', 'vharlen'], party = null } = {}) {
  const online = new Map(), timers = [], moved = [], quests = [], journal = [];
  let tick = 0, wall = 1_000_000;
  const S = createShips({ data: DATA, online, journal: (o, k, p) => journal.push({ who: o.char.name, k, p }), setTimeoutTicks: (fn, n) => timers.push({ at: tick + n, fn }),
    moveTo: (o, prov, at, via) => moved.push({ who: o.char.name, prov, at, via }), questEvent: (o, ev) => quests.push({ who: o.char.name, ev }),
    fighting: o => !!o.fight, provinceLoaded: k => loaded.includes(k), partyOf: () => party, tickMs: 50, wallNow: () => wall });
  const master = h => ({ id: 900 + DATA.harbours.indexOf(h), x: h.master.x, z: h.master.z, name: h.master.name, data: { npc: { role: 'harbourmaster', harbour: h.id } } });
  const gull = master(DATA.harbours.find(h => h.id === 'gullwick'));
  function join(name, { gold = 100, level = 12, x = gull.x + 1, z = gull.z } = {}) {
    const sent = [];
    const o = { char: { id: online.size + 1, name, gold, level, flags: {} }, entity: { id: 100 + online.size, x, z, dead: false, held: null }, conn: { sendJSON: m => sent.push(m) }, sent, room: 'gullwick-town' };
    online.set(o.char.id, o);
    return o;
  }
  const run = ms => { const until = tick + Math.ceil(ms / 50); while (tick < until) { tick++; wall += 50; for (const t of timers.filter(t => t.at <= tick)) { timers.splice(timers.indexOf(t), 1); t.fn(); } } };
  const last = (o, t, op) => o.sent.filter(m => m.t === t && (!op || m.op === op)).at(-1);
  return { S, online, moved, quests, journal, gull, join, run, last };
}

test('ships.json: two harbours, a sailing each way, Gullwick on Torbor Downs and Port Vharl on Vharlen', () => {
  const ids = DATA.harbours.map(h => h.id);
  assert.deepEqual(ids.sort(), ['gullwick', 'port_vharl']);
  assert.equal(DATA.harbours.find(h => h.id === 'gullwick').province, 'torbor_downs');
  assert.equal(DATA.harbours.find(h => h.id === 'port_vharl').province, 'vharlen');
  for (const [a, b] of [['gullwick', 'port_vharl'], ['port_vharl', 'gullwick']]) assert.ok(DATA.sailings.some(s => s.from === a && s.to === b), a + ' -> ' + b);
  for (const h of DATA.harbours) assert.ok(h.master.name && !/ember|veil|muster/i.test(h.master.name + h.name), 'original names: ' + h.master.name);
});

test('the sea routes stay on deep water and every berth has a ship\'s depth under it (horizon.bin)', () => {
  const hz = parseHorizon(readFileSync(join(GAME, 'data/world/horizon.bin')));
  for (const h of DATA.harbours) {
    assert.ok(h.berth, h.id + ' has a berth (node tools/ship-routes.mjs --write)');
    assert.ok(hz.heightAt(h.berth.x, h.berth.z) < -4, h.id + ' berth depth ' + hz.heightAt(h.berth.x, h.berth.z).toFixed(1));
  }
  for (const s of DATA.sailings) {
    assert.ok(Array.isArray(s.path) && s.path.length >= 2, s.from + ' -> ' + s.to + ' has a route');
    const km = pathMetres(s.path) / 1000;
    assert.ok(km > 8 && km < 40, 'a sea crossing, not a hop: ' + km.toFixed(1) + ' km');
    let dry = 0, n = 0;
    for (let i = 1; i < s.path.length; i++) {
      const [a, b] = [s.path[i - 1], s.path[i]], k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 32);
      for (let t = 0; t <= k; t++) { n++; if (hz.heightAt(a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k) > -2) dry++; }
    }
    assert.equal(dry, 0, `${s.from} -> ${s.to}: ${dry} of ${n} samples over shallows or land`);
  }
});

test('placeHarbours: the Harbourmaster goes into the town it stands in, once', () => {
  const g = DATA.harbours.find(h => h.id === 'gullwick');
  const L = { key: 'torbor_downs', ships: DATA, towns: [{ x: g.master.x + 20, z: g.master.z, r: 90, name: 'Gullwick' }], townObjects: [[]], objects: [] };
  assert.equal(placeHarbours(L), 1);
  assert.equal(placeHarbours(L), 0, 'safe to run more than once');
  const npc = L.townObjects[0][0];
  assert.equal(npc.type, 'npc'); assert.equal(npc.npc.role, 'harbourmaster'); assert.equal(npc.npc.harbour, 'gullwick'); assert.equal(npc.title, 'Harbourmaster');
  assert.equal(harbourObjects(DATA, 'nowhere').length, 0);
  const far = { key: 'vharlen', ships: DATA, towns: [], townObjects: [], objects: [] };
  assert.equal(placeHarbours(far), 1); assert.equal(far.objects[0].npc.harbour, 'port_vharl', 'no town room: the wilds');
});

test('a voyage: fare, held for the crossing, ashore at the far dock, logbook + quest event the first time', () => {
  const R = rig();
  const a = R.join('Sailor', { gold: 100 });
  const l = R.S.list(a, R.gull);
  assert.equal(l.t, 'shipList'); assert.equal(l.from, 'gullwick'); assert.equal(l.sailings.length, 1);
  const row = l.sailings[0];
  assert.equal(row.id, 'port_vharl'); assert.equal(row.fare, 60); assert.equal(row.s, 40); assert.ok(!row.locked);
  R.S.go(a, { to: 'port_vharl' }, R.gull);
  assert.equal(R.last(a, 'shipR', 'go').ok, true);
  assert.equal(a.char.gold, 40, 'the fare is taken');
  assert.equal(a.entity.held, 'ship', 'held while at sea');
  const sail = R.last(a, 'shipSail');
  assert.equal(sail.to.id, 'port_vharl'); assert.equal(sail.ms, 40000); assert.ok(sail.path.length >= 2); assert.deepEqual(sail.crew, [a.entity.id]);
  R.S.go(a, { to: 'port_vharl' }, R.gull);
  assert.equal(R.last(a, 'shipR', 'go').why, 'busy', 'one voyage at a time');
  R.run(39000);
  assert.equal(R.moved.length, 0, 'still at sea at 39 s');
  R.run(1200);
  assert.equal(R.moved.length, 1);
  const mv = R.moved[0], dock = DATA.harbours.find(h => h.id === 'port_vharl').dock;
  assert.equal(mv.prov, 'vharlen'); assert.equal(mv.via, 'ship'); assert.ok(Math.hypot(mv.at.x - dock.x, mv.at.z - dock.z) < 1);
  assert.equal(a.entity.held, null);
  const arr = R.last(a, 'shipR', 'arrive');
  assert.equal(arr.ok, true); assert.equal(arr.first, true); assert.equal(arr.log.n, 1); assert.equal(arr.log.first.from, 'Gullwick');
  assert.ok(a.sent.some(m => m.t === 'chat' && /first voyage/i.test(m.text)), 'a journal line');
  assert.equal(a.char.flags.voyages.n, 1);
  assert.ok(R.journal.some(j => j.k === 'set' && j.p.k === 'flags'), 'the logbook is saved');
  assert.deepEqual(R.quests.map(q => q.ev.kind), ['voyage']); assert.equal(R.quests[0].ev.to, 'port_vharl'); assert.equal(R.quests[0].ev.first, true);
});

test('cut short: dying or leaving at sea calls the voyage off and pays the fare back', () => {
  const R = rig();
  const a = R.join('Drowned', { gold: 60 }), b = R.join('Leaver', { gold: 75 });
  R.S.go(a, { to: 'port_vharl' }, R.gull); R.S.go(b, { to: 'port_vharl' }, R.gull);
  assert.equal(a.char.gold, 0); assert.equal(b.char.gold, 15);
  R.run(10000);
  a.entity.dead = true;
  R.online.delete(b.char.id); b.conn = null;
  R.run(31000);
  assert.equal(R.moved.length, 0, 'nobody is moved');
  assert.equal(a.char.gold, 60); assert.equal(b.char.gold, 75, 'both fares back');
  assert.equal(R.last(a, 'shipR', 'arrive').why, 'interrupted');
});

test('refusals in sentences: not sailing yet (the far province is not loaded), no gold, too far, a fight, the same harbour, too low', () => {
  const R = rig({ loaded: ['torbor_downs'] });
  const a = R.join('Early', { gold: 500 });
  const row = R.S.list(a, R.gull).sailings[0];
  assert.equal(row.locked, true); assert.equal(row.why, 'closed'); assert.match(row.msg, /not sailing/i);
  R.S.go(a, { to: 'port_vharl' }, R.gull);
  let r = R.last(a, 'shipR', 'go');
  assert.equal(r.ok, false); assert.equal(r.why, 'closed'); assert.equal(a.char.gold, 500, 'nothing paid');
  const R2 = rig();
  const poor = R2.join('Poor', { gold: 59 });
  assert.equal(R2.S.list(poor, R2.gull).sailings[0].why, 'gold');
  R2.S.go(poor, { to: 'port_vharl' }, R2.gull); r = R2.last(poor, 'shipR', 'go');
  assert.equal(r.why, 'gold'); assert.match(r.msg, /60 gold/);
  const far = R2.join('Faraway', { x: R2.gull.x + 20 });
  R2.S.go(far, { to: 'port_vharl' }, R2.gull); assert.equal(R2.last(far, 'shipR', 'go').why, 'far');
  const hot = R2.join('Fighter'); hot.fight = true;
  R2.S.go(hot, { to: 'port_vharl' }, R2.gull); assert.equal(R2.last(hot, 'shipR', 'go').why, 'fight');
  const same = R2.join('Stayer');
  R2.S.go(same, { to: 'gullwick' }, R2.gull); assert.equal(R2.last(same, 'shipR', 'go').why, 'same');
  R2.S.go(same, { to: 'atlantis' }, R2.gull); assert.equal(R2.last(same, 'shipR', 'go').why, 'harbour');
  // the level floor is a knob (none by default: the island warns with its band, it does not bar the door)
  const R3 = rig(); R3.S.R.minLevel = 10;
  const low = R3.join('Lowly', { level: 3 });
  R3.S.go(low, { to: 'port_vharl' }, R3.gull); assert.equal(R3.last(low, 'shipR', 'go').why, 'level');
  assert.equal(R.S.list(a, R.gull).sailings[0].band.join('-'), '10-20', 'the far land\'s levels are on the row');
});

test('a party sails together: every member close by who can pay boards, each pays their own fare; the rest are named', () => {
  const R = rig();
  const lead = R.join('Captain', { gold: 100 }), mate = R.join('Bosun', { gold: 80, x: R.gull.x + 12 }), broke = R.join('Stowaway', { gold: 5, x: R.gull.x + 4 }), away = R.join('Ashore', { gold: 500, x: R.gull.x + 300 });
  R.S.go(lead, { to: 'port_vharl', party: false }, R.gull);       // without party: true only you sail
  assert.equal(mate.entity.held, null);
  const R2 = rig({ party: { id: 7, leader: 1, members: [1, 2, 3, 4] } });
  const l2 = R2.join('Captain', { gold: 100 }), m2 = R2.join('Bosun', { gold: 80, x: R2.gull.x + 12 }), b2 = R2.join('Stowaway', { gold: 5, x: R2.gull.x + 4 }), a2 = R2.join('Ashore', { gold: 500, x: R2.gull.x + 300 });
  R2.S.go(l2, { to: 'port_vharl', party: true }, R2.gull);
  const r = R2.last(l2, 'shipR', 'go');
  assert.equal(r.ok, true); assert.deepEqual(r.crew, ['Captain', 'Bosun']); assert.deepEqual(r.left, [{ name: 'Stowaway', why: 'gold' }]);
  assert.equal(l2.char.gold, 40); assert.equal(m2.char.gold, 20, 'each pays their own fare'); assert.equal(b2.char.gold, 5); assert.equal(a2.char.gold, 500);
  assert.equal(m2.entity.held, 'ship'); assert.equal(b2.entity.held, null);
  assert.deepEqual(R2.last(m2, 'shipSail').crew, [l2.entity.id, m2.entity.id], 'both see who is on deck');
  assert.equal(R2.last(m2, 'shipR', 'go').with, 'Captain');
  R2.run(40500);
  assert.equal(R2.moved.length, 2);
  const [p, q] = R2.moved;
  assert.ok(Math.hypot(p.at.x - q.at.x, p.at.z - q.at.z) > 0.8, 'ashore a pace apart');
  void lead; void broke; void away; void mate;
});

test('skip: not in the first five seconds; after that you are ashore at once', () => {
  const R = rig();
  const a = R.join('Impatient', { gold: 100 });
  R.S.op(a, { op: 'skip' }, () => null); assert.equal(R.last(a, 'shipR', 'skip').why, 'none');
  R.S.go(a, { to: 'port_vharl' }, R.gull);
  R.run(2000);
  R.S.op(a, { op: 'skip' }, () => null); assert.equal(R.last(a, 'shipR', 'skip').why, 'early');
  assert.equal(R.moved.length, 0);
  R.run(3500);
  R.S.op(a, { op: 'skip' }, () => null);
  assert.equal(R.moved.length, 1); assert.equal(R.last(a, 'shipR', 'arrive').skipped, true);
  R.run(40000);
  assert.equal(R.moved.length, 1, 'the timer does not move you twice');
  // the second voyage is not a first
  const b = R.S.list(a, R.gull);
  assert.equal(b.log.n, 1);
});

test('the way back: Port Vharl -> Gullwick puts you on Gullwick\'s quay in Torbor Downs', () => {
  const R = rig();
  const pv = DATA.harbours.find(h => h.id === 'port_vharl');
  const master = { id: 950, x: pv.master.x, z: pv.master.z, name: pv.master.name, data: { npc: { role: 'harbourmaster', harbour: 'port_vharl' } } };
  const a = R.join('Homeward', { gold: 100, x: pv.master.x + 1, z: pv.master.z });
  const l = R.S.list(a, master);
  assert.equal(l.sailings[0].id, 'gullwick');
  R.S.go(a, { to: 'gullwick' }, master);
  assert.equal(R.last(a, 'shipSail').path[0][0], DATA.harbours.find(h => h.id === 'port_vharl').berth.x, 'the route starts at Port Vharl\'s berth');
  R.run(40500);
  assert.equal(R.moved[0].prov, 'torbor_downs');
  const g = DATA.harbours.find(h => h.id === 'gullwick').dock;
  assert.ok(Math.hypot(R.moved[0].at.x - g.x, R.moved[0].at.z - g.z) < 1);
});

test('the REAL world: the Harbourmaster stands in Gullwick on walkable ground, talks, and the ship is not sailing yet (Vharlen not loaded)', { timeout: 240000 }, async () => {
  const { realServer, joinReal, rec, run } = await import('../A/pt1-helpers.js');
  const { srv, clock, world } = await realServer();
  const S = world.ships;
  assert.ok(S && S.harbours.size === 2, 'ships.json is loaded with the province');
  let hm = null;
  for (const pv of world.P.values()) for (const r of [...pv.towns, ...pv.copies]) for (const x of r.objects.values()) if (x.data && x.data.npc && x.data.npc.role === 'harbourmaster') hm = hm || { x, r };
  assert.ok(hm, 'a Harbourmaster stands somewhere');
  assert.equal(hm.r.kind, 'town', 'in a town room'); assert.equal(hm.r.name, 'Gullwick');
  assert.equal(hm.x.info().title, 'Harbourmaster');
  const T = hm.r.terrain;
  if (T && T.walkable) assert.ok(T.walkable(hm.x.x, hm.x.z), 'the Harbourmaster stands on ground you can walk to');
  const a = await joinReal(srv, clock, 'Seafarer', 'warrior');
  const box = []; for (const t of ['used', 'shipList', 'shipR']) a.on(t, m => box.push({ ...m, t }));
  world.transfer(rec(world, a), hm.r, { x: hm.x.x + 1.5, z: hm.x.z }, 'test'); await run(clock, 300);
  rec(world, a).char.gold = 500;
  a.use(hm.x.id); await run(clock, 300);
  assert.ok(box.some(m => m.t === 'used' && m.ok && m.kind === 'npc' && m.role === 'harbourmaster'), 'answers as an NPC');
  const l = box.filter(m => m.t === 'shipList').at(-1);
  assert.ok(l, 'the sailing list follows'); assert.equal(l.from, 'gullwick');
  const row = l.sailings.find(r => r.id === 'port_vharl');
  if (world.P.has('vharlen')) assert.ok(!row.locked, 'Vharlen is loaded: the ship sails');
  else {
    assert.equal(row.why, 'closed');
    S.go(rec(world, a), { to: 'port_vharl' }, hm.x); await run(clock, 100);
    assert.equal(box.filter(m => m.t === 'shipR').at(-1).why, 'closed');
    assert.equal(rec(world, a).char.gold, 500, 'nothing paid');
  }
  a.close(); await srv.stop();
});

test('the REAL realm with both islands: Gullwick -> Port Vharl and back, held at sea, ashore on the far quay in the other province', { timeout: 600000 }, async t => {
  const { loadLayouts, loadRules, loadClasses } = await import('../../server/load.mjs');
  const { createVirtualClock } = await import('../../js/net/clock.js');
  const { createMemoryStore } = await import('../../js/sim/store-memory.js');
  const { createLoopbackServer } = await import('../../js/sim/loopback.js');
  const { createWorld } = await import('../../js/sim/world.js');
  const { run, until } = await import('../A/helpers.js');
  const { joinReal, rec } = await import('../A/pt1-helpers.js');
  const map = JSON.parse(readFileSync(join(GAME, 'data/world/province-map.json'), 'utf8')).provinces;
  if (!map.vharlen) { t.skip('Vharlen is not in province-map.json yet'); return; }
  const quiet = console.log;
  const L = await loadLayouts(['torbor_downs', 'vharlen']);
  const { createRules, kitsFor } = await loadRules('auto');
  console.log = quiet;
  const clock = createVirtualClock();
  const world = createWorld({ store: createMemoryStore({ now: clock.now }), layouts: L.layouts, events: L.events, encounterInfo: L.encounterInfo, createRules, classes: loadClasses(), kitsFor: kitsFor || null,
    now: clock.now, lingerMs: 0, log: () => {}, directorOpts: { rules: L.directorRules || {} }, warm: false, newcomer: { underLevel: 0, firstMinutes: 0 } });
  const srv = createLoopbackServer({ clock, world }); await srv.ready;
  const find = id => { for (const pv of world.P.values()) for (const r of [...pv.towns, ...pv.copies]) for (const x of r.objects.values()) if (x.data && x.data.npc && x.data.npc.harbour === id) return { x, r }; return null; };
  const g = find('gullwick'), p = find('port_vharl');
  assert.ok(g && p, 'a Harbourmaster on each island');
  assert.equal(g.r.meta.province, 'torbor_downs'); assert.equal(p.r.meta.province, 'vharlen');
  const a = await joinReal(srv, clock, 'Voyager', 'warrior');
  const box = []; for (const k of ['shipList', 'shipR', 'shipSail', 'joined']) a.on(k, m => box.push({ ...m, t: k }));
  world.transfer(rec(world, a), g.r, { x: g.x.x - 2, z: g.x.z }, 'test'); await run(clock, 300);
  rec(world, a).char.gold = 300;
  a._raw('game', JSON.stringify({ t: 'ship', op: 'list', id: g.x.id })); await run(clock, 200);
  const row = box.filter(m => m.t === 'shipList').at(-1).sailings.find(r => r.id === 'port_vharl');
  assert.ok(row && !row.locked, 'Vharlen is loaded: the ship sails ' + JSON.stringify(row));
  a._raw('game', JSON.stringify({ t: 'ship', op: 'go', id: g.x.id, to: 'port_vharl' })); await run(clock, 300);
  assert.equal(box.filter(m => m.t === 'shipR').at(-1).ok, true);
  assert.equal(rec(world, a).char.gold, 240);
  const j0 = box.filter(m => m.t === 'joined').length;
  await run(clock, 20000);
  assert.equal(rec(world, a).room.meta.province, 'torbor_downs', 'still at sea at 20 s');
  await until(clock, () => box.filter(m => m.t === 'joined').length > j0, 25000);
  await run(clock, 300);
  const o = rec(world, a), dock = DATA.harbours.find(h => h.id === 'port_vharl').dock;
  assert.equal(o.room.meta.province, 'vharlen', 'ashore in Vharlen');
  assert.ok(Math.hypot(o.entity.x - dock.x, o.entity.z - dock.z) < 4, 'on Port Vharl\'s quay');
  assert.ok(!o.entity.held);
  assert.equal(o.char.flags.voyages.n, 1);
  // and home again
  const p2 = find('port_vharl');
  world.transfer(o, p2.r.meta.province === o.room.meta.province && o.room.kind === p2.r.kind ? o.room : p2.r, { x: p2.x.x - 2, z: p2.x.z }, 'test'); await run(clock, 300);
  const pm = [...rec(world, a).room.objects.values()].find(x => x.data && x.data.npc && x.data.npc.harbour === 'port_vharl');
  assert.ok(pm, 'the Port Vharl Harbourmaster stands in your copy of the wilds');
  a._raw('game', JSON.stringify({ t: 'ship', op: 'go', id: pm.id, to: 'gullwick' })); await run(clock, 300);
  assert.equal(box.filter(m => m.t === 'shipR').at(-1).ok, true, JSON.stringify(box.filter(m => m.t === 'shipR').at(-1)));
  await run(clock, 41000);
  const back = rec(world, a), gd = DATA.harbours.find(h => h.id === 'gullwick').dock;
  assert.equal(back.room.meta.province, 'torbor_downs'); assert.equal(back.room.name, 'Gullwick');
  assert.ok(Math.hypot(back.entity.x - gd.x, back.entity.z - gd.z) < 4, 'on Gullwick\'s quay');
  assert.equal(back.char.flags.voyages.n, 2); assert.equal(back.char.gold, 180);
  a.close(); await srv.stop();
});
