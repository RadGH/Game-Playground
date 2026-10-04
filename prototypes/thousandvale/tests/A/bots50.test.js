// M1 gate (PLAN §15): 50 bots, 30 of them milling about the town hub, 20 fighting in the wilds:
// tick p99 < 10 ms, town and wilds bandwidth inside the §8.4 budgets. In-process with the real combat core
// (stream C) when it loads; stream G runs the same over real sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, makeClient, run, waitP, ent, roomOf } from './helpers.js';
import { seedStream, next, range } from '../../js/sim/rng.js';

let createRules;
try { ({ createRules } = await import('../../js/rules/index.js')); } catch { createRules = undefined; }

test('50 bots (30 in the town): tick p99 < 10 ms, bandwidth in budget', { timeout: 240000 }, async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { perfNow: () => performance.now(), ...(createRules ? { createRules } : {}) } });
  await srv.ready;
  const W = srv.world, T = W.town, camps = W.copies[0].camps;
  const bots = [];
  for (let i = 0; i < 50; i++) {
    const b = makeClient(srv, clock);
    await waitP(clock, b.ready);
    const ch = await waitP(clock, b.createChar({ name: 'Bot ' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)) + 'x', cls: i % 3 ? 'warrior' : 'rogue' }));
    await waitP(clock, b.play(ch.id));
    b.rng = seedStream(i + 11, 'bot'); b.s = 0; b.bytes = 0; b.town = i < 30;
    b.on('snap', s => { b.bytes += s.bytes; });
    bots.push(b);
  }
  const goalOf = b => {
    if (b.town) { const a = range(b.rng, 0, 6.283), d = range(b.rng, 0, T.r * 0.8); return { x: T.x + Math.cos(a) * d, z: T.z + Math.sin(a) * d }; }
    const c = camps[Math.floor(next(b.rng) * camps.length)];
    return { x: c.x + range(b.rng, -12, 12), z: c.z + range(b.rng, -12, 12) };
  };
  // wilds bots start out at the camps (as if they had walked there)
  for (const b of bots) { b.goal = goalOf(b); if (!b.town) W.transfer(W.online.get(b.joined.you.char), W.copies[0], { ...b.goal }, 'test'); }
  const step = async () => {
    for (const b of bots) {
      const e = ent(srv, b); if (!e) continue;
      if (e.dead) { if (next(b.rng) < 0.05) b.respawn(); continue; }
      let target = null, best = 25;
      if (!b.town) for (const m of b.mirror.ents.values()) if (m.kind === 'monster' && m.hp > 0) { const d = Math.hypot(m.x - e.x, m.z - e.z); if (d < best) { best = d; target = m; } }
      let gx = b.goal.x, gz = b.goal.z;
      if (target) { gx = target.x; gz = target.z; if (best < 2.6) b.cast({ slot: 0, target: target.id }); }
      const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz);
      if (!target && d < 2) b.goal = goalOf(b);
      if (b.town && next(b.rng) < 0.002) b.say('well met');
      b.input({ s: ++b.s, dt: 50, mx: d > 1.5 ? dx / d : 0, mz: d > 1.5 ? dz / d : 0, yaw: Math.atan2(dx, dz), b: 0 });
    }
    await run(clock, 50, 50);
  };
  for (let i = 0; i < 60; i++) await step();
  for (const b of bots) b.bytes = 0;
  const t0 = W.tickStats.summary().ticks;
  for (let i = 0; i < 1300; i++) await step();      // 65 s: the 1-minute window holds only steady ticks
  const st = W.tickStats.summary();
  const inTown = bots.filter(b => roomOf(srv, b) === W.townRoom);
  const kb = list => list.reduce((a, b) => a + b.bytes, 0) / Math.max(1, list.length) / 65 / 1024;
  const xp = bots.reduce((a, b) => a + (b.joined ? b.joined.you.xp : 0), 0);
  console.log(`# 50 bots (${inTown.length} in town, rules ${createRules ? 'C' : 'v0'}): tick p50 ${st.p50} p95 ${st.p95} p99 ${st.p99} max ${st.max} ms over ${st.ticks - t0} ticks; down ${kb(bots.filter(b => b.town)).toFixed(2)} KB/s town, ${kb(bots.filter(b => !b.town)).toFixed(2)} KB/s wilds; xp ${xp}; rulesErrors ${W.status().rulesErrors}`);
  assert.ok(inTown.length >= 28, 'town bots stayed in the town: ' + inTown.length);
  assert.ok(st.p99 < 10, 'p99 ' + st.p99);
  assert.ok(kb(bots.filter(b => b.town)) < 24, 'town budget');
  assert.ok(kb(bots.filter(b => !b.town)) < 8, 'wilds budget');
  assert.equal(W.status().rulesErrors, 0);
  for (const b of bots) b.close();
  await srv.stop();
});
