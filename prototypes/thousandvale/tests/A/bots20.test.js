// M0 gate (PLAN §15): 20 bots in one room, tick < 5 ms. In-process (loopback) so the number is the sim's
// own cost; stream G runs the same over real WebSockets (tests/load/). Also reports snapshot bytes/client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, makeClient, run, until, waitP } from './helpers.js';
import { ent as entOf_, roomOf as roomOf_ } from './helpers.js';
import { seedStream, next, range } from '../../js/sim/rng.js';

test('20 bots walking and fighting for 60 s: tick p99 < 5 ms', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { perfNow: () => performance.now() } });
  await srv.ready;
  const bots = [];
  for (let i = 0; i < 20; i++) {
    const b = makeClient(srv, clock);
    await waitP(clock, b.ready);
    const ch = await waitP(clock, b.createChar({ name: 'Bot ' + String.fromCharCode(65 + i) + 'x', cls: 'warrior' }));
    await waitP(clock, b.play(ch.id));
    b.rng = seedStream(i + 1, 'bot'); b.s = 0; b.bytes = 0;
    b.on('snap', s => { b.bytes += s.bytes; });
    bots.push(b);
  }
  const camps = srv.world.room.camps;
  const goalOf = b => { const c = camps[Math.floor(next(b.rng) * camps.length)]; return { x: c.x + range(b.rng, -15, 15), z: c.z + range(b.rng, -15, 15) }; };
  for (const b of bots) b.goal = goalOf(b);
  // warm up 2 s, then measure 60 s
  const step = async () => {
    for (const b of bots) {
      const me = b.lastSnap && b.lastSnap.self ? b.lastSnap.self : null;
      const e = entOf_(srv, b); if (!e) continue;
      if (e.dead) { if (next(b.rng) < 0.05) b.respawn(); continue; }
      let target = null, best = 30;
      for (const m of b.mirror.ents.values()) if (m.kind === 'monster' && m.hp > 0) { const d = Math.hypot(m.x - e.x, m.z - e.z); if (d < best) { best = d; target = m; } }
      let gx = b.goal.x, gz = b.goal.z;
      if (target) { gx = target.x; gz = target.z; if (best < 3) b.cast({ slot: 0, target: target.id }); }
      const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz);
      if (!target && d < 2) b.goal = goalOf(b);
      b.input({ s: ++b.s, dt: 50, mx: d > 1.5 ? dx / d : 0, mz: d > 1.5 ? dz / d : 0, yaw: Math.atan2(dx, dz), b: 0 });
      void me;
    }
    await run(clock, 50, 50);
  };
  for (let i = 0; i < 40; i++) await step();
  const ticks0 = srv.world.tickStats.summary().ticks;
  for (const b of bots) b.bytes = 0;
  for (let i = 0; i < 1200; i++) await step();
  const st = srv.world.tickStats.summary();
  const bytesPerClientSec = bots.reduce((a, b) => a + b.bytes, 0) / bots.length / 60;
  const kills = bots.reduce((a, b) => a + b.evs.filter(e => e.type === 'xp').length, 0);
  console.log(`# 20 bots: tick p50 ${st.p50} ms, p95 ${st.p95}, p99 ${st.p99}, max ${st.max}; snapshots ${(bytesPerClientSec / 1024).toFixed(2)} KB/s per client; xp events ${kills}; ticks ${st.ticks - ticks0}`);
  assert.ok(st.p99 < 5, 'p99 ' + st.p99);
  assert.ok(bytesPerClientSec < 8 * 1024, 'bytes/client/s ' + bytesPerClientSec);
  assert.ok(kills > 0, 'the bots killed something');
  for (const b of bots) b.close();
  await srv.stop();
});
