// Owner feedback 6 (stream A), in a dungeon instance:
//   U11 (#6)  "Druid was frustrated they could not heal me" — TWO REAL WebSocket clients, partied, inside The Ploughman's Crypt
//   U10 (#7)  the way out stands only after the last boss; the way you came in is a door, not the exit portal
//   U12 (#5)  dying puts you back on the floor you died on; the stair up is a lift (asks which floor when there is a choice)
//   U14 (#3)  dungeon objects say which floor they are on and which way they lead (for the minimap)
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/main.mjs';
import { connect } from '../../js/net/client.js';
import { nodeSafeWsFactory } from '../../tools/bot-client.mjs';
import { dungeonRoomSpec } from '../../js/sim/dungeon.js';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); } return !!fn(); };

async function twoInTheCrypt(druidLevel) {
  const port = 18700 + Math.floor(Math.random() * 800);
  const quiet = console.log; console.log = () => {};
  const out = process.stdout.write.bind(process.stdout); process.stdout.write = (c, ...a) => (typeof c === 'string' && c.startsWith('{"t":"') ? true : out(c, ...a));
  const S = await startServer({ port, host: '127.0.0.1', db: 'memory', build: 'dev', rules: 'auto', procs: 0, linger: 0, maxPerIp: 50, saveEvery: 60000, process: 't', env: 'dev', adminPort: 0, director: {}, unlimitedIp: [], feedbackFile: false, journalMs: 2000 });
  console.log = quiet;
  const W = S.world, P = W.province;
  const mk = async (name, cls) => {
    const n = connect({ mode: 'ws', socketFactory: nodeSafeWsFactory('ws://127.0.0.1:' + port), build: 'dev' });
    n.got = []; for (const t of ['castR', 'targetR', 'err', 'partyInvite', 'partyFrames', 'used']) n.on(t, m => n.got.push({ t, ...(Array.isArray(m) ? { rows: m } : m) }));
    await n.ready; const ch = await n.createChar({ name, cls }); await n.play(ch.id); return n;
  };
  const k = await mk('Knightly', 'knight'), d = await mk('Leafy', 'druid');
  await sleep(200);
  const ok = W.online.get(k.joined.you.char), od = W.online.get(d.joined.you.char);
  const lvl = (o, L) => { if (L > 1) o.room.award(o.entity, { xp: o.room.rules.xpFor(L) + 1 - (o.char.xp || 0), reason: 'test' }); };
  lvl(ok, 3); lvl(od, druidLevel);
  k.partyOp('invite', { name: 'Leafy' });
  await waitFor(() => d.got.some(m => m.t === 'partyInvite'));
  d.partyOp('accept', { party: d.got.find(m => m.t === 'partyInvite').party });
  await waitFor(() => P.partyOf.get(od.char.id));
  const copy = P.copies[0];
  const door = [...copy.objects.values()].find(x => x.data && x.data.portal && x.data.portal.to === 'dungeon' && x.type !== 'cave');
  for (const o of [ok, od]) P.transfer(o, copy, { x: door.x + 1, z: door.z + 1 }, 'test');
  await sleep(300);
  k.use(door.id); await waitFor(() => ok.room.kind === 'instance');
  d.use(door.id); await waitFor(() => od.room.kind === 'instance');
  const stop = async () => { k.close(); d.close(); await S.stop(); process.stdout.write = out; };
  return { S, W, P, k, d, ok, od, stop };
}

test('U11: two real socket clients, partied, in the dungeon — the druid targets the knight and the direct heal lands (at the level the bar says the key is open)', async () => {
  const T = await twoInTheCrypt(1);
  const { k, d, ok, od } = T;
  try {
    assert.equal(ok.room, od.room, 'the party shares one instance'); assert.equal(ok.room.kind, 'instance');
    const bar0 = od.room.barFor(od.entity);
    const heal = bar0.find(s => s.ally && (s.slot === 1 || s.slot === 2));
    assert.ok(heal, 'the druid has a direct ally heal on key 1 or 2: ' + bar0.map(s => s.slot + ':' + s.id).join(' '));
    // the level the key opens at: read from the refusal the rules give a level-1 druid, then level up to it
    const e = ok.entity, hurt = () => { e.r.unit.hp = Math.round(e.r.unit.maxHp * 0.4); e.setHp(Math.round(e.hpMax * 0.4)); return e.hp; };
    let before = hurt();
    d.target(e.id); await sleep(150);
    assert.ok(!d.got.some(m => m.t === 'targetR' && m.ok === false), 'a party member in the instance can be targeted: ' + JSON.stringify(d.got.filter(m => m.t === 'targetR')));
    assert.equal(od.entity.target, e.id, 'the server holds the knight as the druid\'s target');
    // the party frame is the click target: it carries the same entity id
    await waitFor(() => d.got.some(m => m.t === 'partyFrames' && m.rows.some(r => r.char === ok.char.id && r.id === e.id)), 3000);
    assert.ok(d.got.some(m => m.t === 'partyFrames' && m.rows.some(r => r.char === ok.char.id && r.id === e.id)), 'partyFrames carries the knight\'s entity id');
    d.cast({ slot: heal.slot, target: e.id });
    await waitFor(() => e.hp > before + 8 || d.got.some(m => m.t === 'castR'), 2500);
    const refused = d.got.find(m => m.t === 'castR' && m.ok === false);
    let needLevel = 1;
    if (refused) {
      const m = /level (\d+)/.exec(refused.text || '');
      assert.ok(m, 'the only refusal is the key\'s unlock level, said in words: ' + JSON.stringify(refused));
      needLevel = +m[1];
      od.room.award(od.entity, { xp: od.room.rules.xpFor(needLevel) + 1 - (od.char.xp || 0), reason: 'test' });
      await sleep(200);
      d.got.length = 0; before = hurt();
      d.cast({ slot: heal.slot, target: e.id });
      await waitFor(() => e.hp > before + 8 || d.got.some(m => m.t === 'castR'), 2500);
    }
    assert.ok(e.hp > before + 8, `the knight was healed in the instance (${before} -> ${e.hp}) by a level-${od.char.level} druid; refusals ${JSON.stringify(d.got.filter(m => m.t === 'castR'))}`);
    healOpensAt = { level: needLevel, name: heal.name || heal.id };
  } finally { await T.stop(); }
});

// What the owner actually hit (#6): his druid was LEVEL 2 and the heal key opens at 3. That is stream C's skill ladder, not the
// server — asked in docs/requests.md ("A -> C — Round 6, U11 REPRODUCED"); C opened every healer's direct heal at level 1.
let healOpensAt = null;
test('U11 (stream C\'s part, landed): a healer\'s direct heal is open at level 1 — the level-1 druid healed the knight with no level-up', () => {
  assert.ok(healOpensAt, 'the socket test above ran');
  assert.equal(healOpensAt.level, 1, `"${healOpensAt.name}" opens at level ${healOpensAt.level}`);
});

test('U10: one way out, behind the last boss; the way you came in is a door (it leaves, but it is not the exit portal); no shortcut portal mid-dungeon', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Delver');
  const o = rec(world, a);
  const copy = P.copies[0];
  const door = [...copy.objects.values()].find(x => x.data && x.data.portal && x.data.portal.to === 'dungeon' && x.type !== 'cave');
  P.transfer(o, copy, { x: door.x + 1, z: door.z }, 'test'); await run(clock, 300);
  a.use(door.id); await until(clock, () => o.room.kind === 'instance', 3000);
  const r = o.room, plan = r.meta.plan, objs = [...r.objects.values()];
  const exits = objs.filter(x => x.type === 'exit');
  assert.equal(exits.length, 1, 'exactly one way out: ' + exits.map(x => Math.round(x.x) + ',' + Math.round(x.z)));
  const last = plan.floors.at(-1);
  assert.ok(exits[0].x >= last.origin.x, 'on the last floor');
  const boss = last.packs.find(p => p.rank === 'boss');
  const reward = last.rooms.find(q => q.kind === 'reward');
  assert.ok(boss && reward, 'the last floor has its boss and a reward room');
  assert.equal(exits[0].info().floor, plan.floors.length); assert.equal(exits[0].info().portal, 'out');
  const way = objs.filter(x => x.type === 'door');
  assert.equal(way.length, 1, 'the way you came in');
  assert.ok(way[0].x < (plan.floors[1] ? plan.floors[1].origin.x : Infinity) && way[0].info().leave === 1 && way[0].info().portal === 'out' && /came in/i.test(way[0].name), JSON.stringify(way[0].info()));
  assert.ok(!objs.some(x => /shortcut/i.test(x.name)), 'no shortcut portal in the mini-boss room');
  // it still lets you out
  P.transfer(o, r, { x: way[0].x + 1, z: way[0].z }, 'test'); await run(clock, 200);
  a.use(way[0].id); await until(clock, () => o.room.kind === 'wilds', 3000);
  assert.equal(o.room.kind, 'wilds');
  // U14: every dungeon object says its floor; stairs and lifts say which way
  for (const x of objs) assert.ok(x.info().floor >= 1, x.type + ' has a floor');
  assert.ok(objs.filter(x => x.type === 'stairs').every(x => x.info().portal === 'down'));
  assert.ok(objs.filter(x => x.type === 'lift').every(x => x.info().portal === 'up' && x.info().lift.floors.length >= 1));
  a.close(); await srv.stop();
});

test('U12: dying on floor 2 gets you up on floor 2 (its landing), not at the top; the stair up goes to the floor above\'s landing', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Fallsdown');
  const o = rec(world, a);
  const copy = P.copies[0];
  const door = [...copy.objects.values()].find(x => x.data && x.data.portal && x.data.portal.to === 'dungeon' && x.type !== 'cave');
  P.transfer(o, copy, { x: door.x + 1, z: door.z }, 'test'); await run(clock, 300);
  a.use(door.id); await until(clock, () => o.room.kind === 'instance', 3000);
  const r = o.room, plan = r.meta.plan;
  assert.ok(plan.floors.length >= 2);
  const f2 = plan.floors[1], land2 = f2.landing || f2.entry, land1 = plan.floors[0].landing || plan.floors[0].entry;
  // die deep in floor 2
  const deep = f2.packs.find(p => p.rank === 'boss') || f2.packs[0];
  for (const m of [...r.entities.values()]) if (m.kind === 'monster') r.remove(m);
  P.transfer(o, r, { x: deep.x, z: deep.z }, 'test'); await run(clock, 200);
  o.entity.kill(); if (o.entity.r.unit) { o.entity.r.unit.hp = 0; o.entity.r.unit.dead = true; }
  await run(clock, 300);
  const yous = []; a.on('you', m => yous.push(m));
  a.respawn(); await until(clock, () => !o.entity.dead, 2000);
  assert.equal(o.room, r, 'still in the dungeon');
  assert.ok(Math.hypot(o.entity.x - land2.x, o.entity.z - land2.z) < 1.5, `up at floor 2's landing (${Math.round(o.entity.x)}, ${Math.round(o.entity.z)}), not at the entrance (${Math.round(land1.x)}, ${Math.round(land1.z)})`);
  assert.ok(yous.some(y => y.floor === 2), 'told which floor');
  // dying on floor 1 = floor 1
  P.transfer(o, r, { x: plan.floors[0].packs[0].x, z: plan.floors[0].packs[0].z }, 'test'); await run(clock, 200);
  o.entity.kill(); if (o.entity.r.unit) { o.entity.r.unit.hp = 0; o.entity.r.unit.dead = true; }
  await run(clock, 300); a.respawn(); await until(clock, () => !o.entity.dead, 2000);
  assert.ok(Math.hypot(o.entity.x - land1.x, o.entity.z - land1.z) < 1.5, 'floor 1: its own landing');
  // the lift on floor 2: one floor above -> straight to the top
  const lift = [...r.objects.values()].find(x => x.type === 'lift');
  assert.ok(lift, 'a stair up on floor 2');
  P.transfer(o, r, { x: lift.x + 1, z: lift.z }, 'test'); await run(clock, 200);
  const used = []; a.on('used', m => used.push(m));
  a.use(lift.id); await until(clock, () => used.length, 2000);
  assert.equal(used[0].ok, true); assert.equal(used[0].kind, 'stairs');
  await run(clock, 300);
  assert.ok(Math.hypot(o.entity.x - land1.x, o.entity.z - land1.z) < 1.5, 'one floor above: the top of the dungeon, by its entrance');
  a.close(); await srv.stop();
});

test('U12 the lift: with two or more floors above, the stair up ASKS (`used kind:lift` with choices) and `use {id, to}` takes you there; an old client\'s second press goes one floor up', () => {
  // a three-floor plan in E's shape
  const floor = (i, x) => ({ index: i, origin: { x, z: 0 }, w: 10, h: 10, tiles: [], rooms: [], entry: { x: x + 5, z: 5 }, landing: { x: x + 6, z: 6 }, packs: [], name: ['The Upper Graves', 'The Middle Dark', 'The Deep'][i], label: 'Floor ' + (i + 1) });
  const plan = { floors: [floor(0, 0), floor(1, 100), floor(2, 200)] };
  plan.floors[0].door = { x: 5, z: 1 }; plan.floors[0].stairsDown = { x: 9, z: 9 }; plan.floors[1].stairsDown = { x: 109, z: 9 };
  plan.floors[1].lift = { x: 101, z: 5, to: [{ floor: 0, label: 'Floor 1', name: 'The Upper Graves', x: 6, z: 6 }] };
  plan.floors[2].lift = { x: 201, z: 5, to: [{ floor: 1, label: 'Floor 2', name: 'The Middle Dark', x: 106, z: 6 }, { floor: 0, label: 'Floor 1', name: 'The Upper Graves', x: 6, z: 6 }] };
  plan.floors[2].exit = { x: 209, z: 5 };
  const { objects } = dungeonRoomSpec(plan, { exitTo: { room: 'wilds', x: 1, z: 1 } });
  const lifts = objects.filter(o => o.type === 'lift');
  assert.equal(lifts.length, 2);
  assert.deepEqual(lifts[1].lift.to.map(t => [t.floor, t.label, t.name]), [[2, 'Floor 2', 'The Middle Dark'], [1, 'Floor 1', 'The Upper Graves']], 'nearest floor first, 1-based');
  assert.deepEqual(objects.filter(o => o.type === 'exit').map(o => o.floor), [3], 'the way out only on the last floor');
  assert.deepEqual(objects.filter(o => o.type === 'door').map(o => o.floor), [1]);
  assert.deepEqual(objects.filter(o => o.type === 'stairs').map(o => [o.dir, o.portal.x, o.portal.z]), [['down', 106, 6], ['down', 206, 6]], 'stairs down land on the next floor\'s landing');
});

test('U12 the lift on the wire: three floors down, the choice is asked and honoured', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Liftrider');
  const o = rec(world, a);
  const copy = P.copies[0];
  const door = [...copy.objects.values()].find(x => x.data && x.data.portal && x.data.portal.to === 'dungeon' && x.type !== 'cave');
  P.transfer(o, copy, { x: door.x + 1, z: door.z }, 'test'); await run(clock, 300);
  a.use(door.id); await until(clock, () => o.room.kind === 'instance', 3000);
  const r = o.room;
  for (const m of [...r.entities.values()]) if (m.kind === 'monster') r.remove(m);
  // a lift that knows two floors above it (as a three-floor dungeon's bottom floor has)
  const lift = r.spawn({ kind: 'object', type: 'lift', name: 'Stairs up', x: o.entity.x + 1, z: o.entity.z, team: 0,
    data: { lift: { here: 3, to: [{ floor: 2, x: o.entity.x + 6, z: o.entity.z, label: 'Floor 2', name: 'The Middle Dark' }, { floor: 1, x: o.entity.x + 12, z: o.entity.z, label: 'Floor 1', name: 'the entrance' }] }, floor: 3, dir: 'up' } });
  const x0 = o.entity.x;
  const used = []; a.on('used', m => used.push(m));
  a.use(lift.id); await until(clock, () => used.length, 2000);
  assert.equal(used[0].kind, 'lift'); assert.equal(used[0].here, 3);
  assert.deepEqual(used[0].choices.map(c => [c.to, c.floor, c.label]), [['f:2', 2, 'Floor 2'], ['f:1', 1, 'Floor 1']]);
  assert.ok(Math.abs(o.entity.x - x0) < 0.1, 'asked, not moved');
  a.use(lift.id, 'f:1'); await until(clock, () => used.length >= 2, 2000);
  await run(clock, 200);
  assert.ok(Math.abs(o.entity.x - (x0 + 12)) < 1, 'taken to floor 1');
  a.use(lift.id, 'f:9'); await until(clock, () => used.length >= 3, 2000);
  assert.equal(used[2].ok, false);
  // an old client: two plain presses = one floor up
  P.transfer(o, r, { x: x0, z: o.entity.z }, 'test'); await run(clock, 200);
  a.use(lift.id); await until(clock, () => used.length >= 4, 2000);
  a.use(lift.id); await until(clock, () => used.length >= 5, 2000);
  await run(clock, 200);
  assert.ok(Math.abs(o.entity.x - (x0 + 6)) < 1, 'the floor just above');
  a.close(); await srv.stop();
});
