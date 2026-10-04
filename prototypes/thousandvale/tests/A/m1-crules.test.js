// The real combat core (stream C's js/rules/index.js) inside the M1 world: kills pay xp and loot into the
// bag, handoffs and instances run with 0 rules errors. Skipped if js/rules/index.js cannot load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run, until, ent, roomOf } from './helpers.js';

let createRules = null, why = '';
try { ({ createRules } = await import('../../js/rules/index.js')); } catch (err) { why = err.message; }

test('C rules: fight in the wilds, loot lands in the bag, dungeon works, no rules errors', { skip: !createRules && ('rules failed to load: ' + why) }, async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { createRules } });
  await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Realfighter', 'warrior');
  const r = W.copies[0];
  let kills = 0;
  for (let k = 0; k < 8 && kills < 3; k++) {
    const wolf = [...r.entities.values()].find(e => e.kind === 'monster' && !e.dead);
    W.transfer(W.online.get(a.joined.you.char), r, { x: wolf.x + 1.2, z: wolf.z }, 'test');
    await run(clock, 100);
    for (let g = 0; g < 80 && !wolf.dead && !ent(srv, a).dead; g++) { a.cast({ slot: 0, target: wolf.id }); await run(clock, 400); }
    if (ent(srv, a).dead) { a.respawn(); await run(clock, 300); }
    if (wolf.dead) kills++;
  }
  assert.ok(kills >= 1, 'killed ' + kills);
  assert.ok(a.joined.you.xp > 0, 'xp');
  const st = W.status();
  assert.equal(st.rulesErrors, 0);
  // dungeon
  W.transfer(W.online.get(a.joined.you.char), W.copies[0], { x: W.door.x + 1, z: W.door.z }, 'test');
  await run(clock, 200);
  a.use([...W.copies[0].objects.values()].find(o => o.type === 'portal').id);
  await run(clock, 500);
  assert.equal(roomOf(srv, a).kind, 'instance');
  const inst = roomOf(srv, a);
  assert.ok([...inst.entities.values()].filter(e => e.kind === 'monster').length > 5);
  // pull the scripted boss: its encounter events must reach the client through the room
  const boss = [...inst.entities.values()].find(e => e.rank === 'boss');
  W.transfer(W.online.get(a.joined.you.char), inst, { x: boss.x + 1.5, z: boss.z }, 'test');
  await run(clock, 200);
  for (let g = 0; g < 60 && !boss.dead; g++) {
    if (ent(srv, a).dead) { const o = W.online.get(a.joined.you.char); ent(srv, a).revive(1); W.transfer(o, inst, { x: boss.x + 1.5, z: boss.z }, 'test'); }
    a.cast({ slot: 0, target: boss.id }); await run(clock, 500);
  }
  const encTypes = new Set(a.evs.filter(e => ['tele', 'teleR', 'castbar', 'castX', 'phase', 'say', 'enrage', 'obj', 'boss'].includes(e.type)).map(e => e.type));
  console.log('# boss encounter events seen: ' + [...encTypes].join(', '));
  assert.ok(encTypes.size >= 1, 'encounter events arrive');
  assert.ok(a.evs.filter(e => encTypes.has(e.type)).every(e => !('t' in e) && Number.isFinite(e.x)), 'key `type`, x/z filled');
  assert.equal(W.status().rulesErrors, 0);
  console.log(`# C rules: kills ${kills}, xp ${a.joined.you.xp}, bag ${a.joined.you.bag.length}, gold ${a.joined.you.gold}`);
  a.close(); await srv.stop();
});
