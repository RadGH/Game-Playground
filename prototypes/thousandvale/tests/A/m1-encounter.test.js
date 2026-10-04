// Encounter events on the wire, arena objects, E's dungeon plans (gates + levers + props), B's reader on the
// host, and the town-edge handoff spread over ticks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createVirtualClock } from '../../js/net/clock.js';
import { EVENT_TYPES, EVENT_FIELDS, OBJ_STATES } from '../../js/net/protocol.js';
import { loadZoneTerrain } from '../../js/sim/terrain.js';
import { makeServer, makeClient, joinAs, run, until, waitP, ent, roomOf } from './helpers.js';

const md = readFileSync(new URL('../../docs/protocol.md', import.meta.url), 'utf8');

test('every event type has a field list and a row in protocol.md; C\'s encounter engine emits only known types', () => {
  for (const t of EVENT_TYPES) {
    assert.ok(EVENT_FIELDS[t], 'EVENT_FIELDS.' + t);
    assert.ok(md.includes('| `' + t + '` |'), 'protocol.md row for ' + t);
  }
  const src = readFileSync(new URL('../../js/rules/encounter.js', import.meta.url), 'utf8');
  const emitted = new Set([...src.matchAll(/emit\(\{ t: '(\w+)'/g)].map(m => m[1]));
  const internal = new Set(['hit', 'heal']);       // field events index.js turns into `hit`
  for (const t of emitted) assert.ok(EVENT_TYPES.includes(t) || internal.has(t), 'unknown event from encounter.js: ' + t);
  assert.ok(OBJ_STATES.includes('broken') && OBJ_STATES.includes('lit'));
});

test('encounter events reach clients near the entity (x, z filled from `id`); arena objects: use -> rules.useObject, state in info', async () => {
  const clock = createVirtualClock();
  let host = null, used = [];
  const createRules = h => {
    host = h;
    return {
      addEntity(e) { if (e.kind !== 'object') { e.setMax(100, 10); e.setHp(100); } },
      useObject(e, obj) { used.push([e.id, obj.data.key]); obj.room.host.objState(obj, 'lit'); return { ok: true }; },
    };
  };
  const srv = makeServer({ clock, worldOpts: { createRules } });
  await srv.ready;
  const W = srv.world, T = W.town;
  const a = await joinAs(srv, clock, 'Near'), b = await joinAs(srv, clock, 'Farther');
  W.transfer(W.online.get(a.joined.you.char), W.townRoom, { x: T.x, z: T.z }, 't');
  W.transfer(W.online.get(b.joined.you.char), W.townRoom, { x: T.x + 10, z: T.z + 40 }, 't');   // still in town, ~41 m off
  await run(clock, 200);
  const townHost = W.townRoom.host;
  const brazier = townHost.spawn({ kind: 'object', type: 'brazier', name: 'Brazier', x: T.x + 2, z: T.z, data: { rules: true, key: 'test-brazier', state: 'idle' } });
  await run(clock, 300);
  assert.equal(a.mirror.infos.get(brazier.id).type, 'brazier');
  assert.equal(a.mirror.infos.get(brazier.id).rules, 1);
  assert.equal(a.mirror.infos.get(brazier.id).key, 'test-brazier');
  townHost.event({ type: 'castbar', id: brazier.id, ab: 'x', name: 'Dark rite', ms: 2000, int: 1 });
  townHost.event({ type: 'tele', id: 77, s: brazier.id, ab: 'x', k: 'harm', ms: 1500, shape: 'circle', x: T.x + 2, z: T.z, r: 5 });
  await run(clock, 100);
  const cb = a.evs.find(e => e.type === 'castbar');
  assert.ok(cb && Math.abs(cb.x - brazier.x) < 1e-9, 'x, z filled from id ' + JSON.stringify(a.evs.slice(-5)));
  assert.ok(a.evs.some(e => e.type === 'tele' && e.shape === 'circle'));
  // use: the server routes it to the rules
  const got = []; a.on('used', u => got.push(u));
  a.use(brazier.id);
  await run(clock, 200);
  assert.deepEqual(used, [[ent(srv, a).id, 'test-brazier']]);
  assert.ok(got[0].ok);
  assert.ok(a.evs.some(e => e.type === 'obj' && e.id === brazier.id && e.state === 'lit'));
  // a late arrival learns the state from info
  const c = await joinAs(srv, clock, 'Latecomer');
  W.transfer(W.online.get(c.joined.you.char), W.townRoom, { x: T.x + 1, z: T.z + 1 }, 't');
  await run(clock, 300);
  assert.equal(c.mirror.infos.get(brazier.id).state, 'lit');
  a.close(); b.close(); c.close(); await srv.stop();
});

test('dungeon from E\'s dungeon-tiers.js: plan name, scripted bosses, a lever opens the gate', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Delver');
  W.transfer(W.online.get(a.joined.you.char), W.copies[0], { x: W.door.x + 1, z: W.door.z }, 't');
  await run(clock, 200);
  a.use([...W.copies[0].objects.values()].find(o => o.type === 'portal').id);
  await run(clock, 400);
  const inst = roomOf(srv, a);
  assert.equal(inst.kind, 'instance');
  const plan = inst.meta.plan;
  assert.ok(!plan.standIn && plan.family, 'E\'s generator, family ' + plan.family);
  assert.equal(a.joined.room.name, plan.name);
  assert.equal(a.joined.room.dungeon.name, plan.name);
  const boss = [...inst.entities.values()].find(e => e.rank === 'boss');
  assert.ok(boss && boss.data && boss.data.encounter, 'boss has its script: ' + (boss && boss.data && boss.data.encounter));
  // gate + lever on floor 0
  const f0 = plan.floors[0];
  if (f0.gate) {
    const gx = f0.origin.x + (f0.gate.i + 0.5) * plan.cell, gz = f0.origin.z + (f0.gate.j + 0.5) * plan.cell;
    assert.equal(inst.walkable(gx, gz), false, 'gate shut');
    assert.equal(a.joined.room.dungeon.floors[0].gate.open, false);
    const lever = [...inst.objects.values()].find(o => o.type === 'lever' && o.data.lever.floor === 0);
    const gate = [...inst.objects.values()].find(o => o.type === 'gate' && o.data.gate.floor === 0);
    W.transfer(W.online.get(a.joined.you.char), inst, { x: lever.x + 1, z: lever.z }, 't');
    await run(clock, 200);
    const got = []; a.on('used', u => got.push(u));
    a.use(lever.id); await run(clock, 200);
    assert.ok(got[0].ok && got[0].opened);
    assert.equal(inst.walkable(gx, gz), true, 'gate open');
    assert.ok(a.evs.some(e => e.type === 'obj' && e.id === gate.id && e.state === 'open'));
    assert.equal(a.mirror.infos.get(lever.id).state, 'used');
    a.use(lever.id); await run(clock, 200);
    assert.equal(got.at(-1).ok, false);
  }
  a.close(); await srv.stop();
});

test('the room host carries B\'s terrain reader for a baked zone', async () => {
  const bytes = readFileSync(new URL('../../data/zones/test/terrain.bin', import.meta.url));
  const terrain = loadZoneTerrain(bytes, 'test');
  let seen = null;
  const createRules = h => { seen = h.terrain; return { addEntity() {} }; };
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { terrain, createRules } });
  await srv.ready;
  assert.ok(seen && seen.reader && typeof seen.reader.slopeAt === 'function');
  assert.equal(srv.world.town.name, 'Torborhold');
  await srv.stop();
});

test('a crowd walking out of town together is handed off a few per tick, not all at once', async () => {
  const clock = createVirtualClock();
  let createRules;
  try { ({ createRules } = await import('../../js/rules/index.js')); } catch { createRules = undefined; }
  const srv = makeServer({ clock, worldOpts: { perfNow: () => performance.now(), ...(createRules ? { createRules } : {}) } });
  await srv.ready;
  const W = srv.world, T = W.town;
  const cs = [];
  for (let i = 0; i < 20; i++) cs.push(await joinAs(srv, clock, 'Crowd ' + String.fromCharCode(97 + i) + 'x'));
  // everyone stands just inside the edge, then all step out on the same tick
  cs.forEach((c, i) => W.transfer(W.online.get(c.joined.you.char), W.townRoom, { x: T.x + T.r - 1, z: T.z + (i - 10) * 0.5 }, 't'));
  await run(clock, 500);
  const t0 = W.counters.transfers;
  const perTick = [];
  let last = t0;
  const orig = W.step;
  let sq = 1000;
  for (let k = 0; k < 30; k++) { if (k < 10) for (const c of cs) c.input({ s: ++sq, dt: 50, mx: 1, mz: 0, yaw: 0, b: 1 }); await run(clock, 50, 50); perTick.push(W.counters.transfers - last); last = W.counters.transfers; }
  void orig;
  assert.equal(W.counters.transfers - t0, 20, 'all 20 handed off');
  assert.ok(Math.max(...perTick) <= 3, 'per tick ' + perTick.join(','));
  assert.ok(cs.every(c => roomOf(srv, c).kind === 'wilds'));
  const st = W.tickStats.summary();
  console.log(`# crowd handoff: per tick ${perTick.filter(Boolean).join(',')}; worst tick ${st.max} ms (rules ${createRules ? 'C' : 'v0'})`);
  for (const c of cs) c.close();
  await srv.stop();
});
