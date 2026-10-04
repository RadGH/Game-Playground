import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer, joinAs, run, until } from './helpers.js';
import { createVirtualClock } from '../../js/net/clock.js';

test('two players join, see each other move, and fight a wolf together', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, latencyMs: 30 });
  await srv.ready;
  const a = await joinAs(srv, clock, 'Aldra');
  const b = await joinAs(srv, clock, 'Bren');
  await run(clock, 300);
  assert.equal(a.status, 'online');
  assert.ok(a.mirror.ents.has(b.you), 'A sees B');
  assert.ok(b.mirror.ents.has(a.you), 'B sees A');
  assert.equal(a.mirror.ents.get(b.you).info.name, 'Bren');

  // A walks east for 1 s
  const startX = srv.world.room.entities.get(a.you).x;
  let s = 0;
  for (let i = 0; i < 20; i++) { a.input({ s: ++s, dt: 50, mx: 1, mz: 0, yaw: Math.PI / 2, b: 0 }); await run(clock, 50); }
  await run(clock, 200);
  const ax = srv.world.room.entities.get(a.you).x;
  assert.ok(Math.abs(ax - startX - 5.4) < 0.3, `moved ${ax - startX} m (expected ~5.4)`);
  const seen = b.mirror.ents.get(a.you);
  assert.ok(Math.abs(seen.x - ax) < 0.2, `B sees A at ${seen.x}, server ${ax}`);
  assert.ok(Math.abs(a.lastSnap ? 0 : 0) === 0);

  // teleport both next to a wolf (server side, test only) and swing until it dies
  const room = srv.world.room;
  const wolf = [...room.entities.values()].find(e => e.kind === 'monster');
  assert.ok(wolf, 'room has wolves');
  const ea = room.entities.get(a.you), eb = room.entities.get(b.you);
  ea.moveTo(wolf.x + 1.5, wolf.z); eb.moveTo(wolf.x - 1.5, wolf.z);
  await run(clock, 200);
  let guard = 0;
  while (!wolf.dead && guard++ < 200) {
    a.cast({ slot: 0, target: wolf.id }); b.cast({ slot: 0, target: wolf.id });
    await run(clock, 300);
  }
  assert.ok(wolf.dead, 'wolf died');
  await run(clock, 200);
  const hitsA = a.evs.filter(e => e.type === 'hit' && e.d === wolf.id);
  assert.ok(hitsA.some(e => e.s === a.you) && hitsA.some(e => e.s === b.you), 'A saw both players hit the wolf');
  assert.ok(a.evs.some(e => e.type === 'die' && e.d === wolf.id));
  assert.ok(a.evs.some(e => e.type === 'xp'), 'A got xp');
  assert.ok(b.evs.some(e => e.type === 'xp'), 'B got xp (shared credit)');
  assert.ok(room.entities.get(a.you).char.xp > 0);
  a.close(); b.close();
  await srv.stop();
});
