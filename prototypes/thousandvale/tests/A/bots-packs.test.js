// Wandering packs + wild events (owner 2026-10-16): what they cost the server. The REAL province (Torbor Downs, the real
// rules), N bots spread over the wilds walking the roads and fighting whatever comes within 25 m, measured over a minute
// with the packs and the wild events OFF, then ON (same bots, same seeds). In-process (loopback), so the numbers are the
// sim's own. Timing gate: TV_PERF=1 node --test tests/A/bots-packs.test.js (alone, on a quiet machine).
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadavg } from 'node:os';
import { realServer, rec, run, until } from './pt1-helpers.js';
import { makeClient, waitP } from './helpers.js';
import { seedStream, next } from '../../js/sim/rng.js';

const PERF = !!process.env.TV_PERF;
const N = +(process.env.TV_PACK_BOTS || 30);

async function measure(on) {
  const { srv, clock, world } = await realServer({ runSeed: 9, perfNow: () => performance.now(), roadEvents: false, ...(on ? {} : { packs: false, wildEvents: false }) });
  const pv = world.P.get('torbor_downs'), room = pv.copies[0];
  const roads = (pv.L.travel.routes || []).filter(r => r.pts.length > 10);
  const bots = [];
  for (let i = 0; i < N; i++) {
    const b = makeClient(srv, clock);
    await waitP(clock, b.ready);
    const ch = await waitP(clock, b.createChar({ name: 'Pk ' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)) + (on ? 'n' : 'f'), cls: ['warrior', 'ranger', 'mage'][i % 3] }));
    await waitP(clock, b.play(ch.id));
    await until(clock, () => !!b.joined, 5000);
    b.rng = seedStream(i + 31, 'bot'); b.s = 0;
    b.road = roads[i % roads.length]; b.k = Math.floor(next(b.rng) * b.road.pts.length); b.dir = 1;
    const p = b.road.pts[b.k];
    const o = rec(world, b); world.transfer(o, room, { x: p[0], z: p[1] }, 'test');
    bots.push(b);
  }
  await run(clock, 1000);
  for (const b of bots) { const o = rec(world, b); if (o) { o.char.level = 6; o.roadNextAt = Infinity; } }
  const step = async () => {
    for (const b of bots) {
      const o = rec(world, b), e = o && o.entity; if (!e) continue;
      if (e.dead) { if (next(b.rng) < 0.05) b.respawn(); continue; }
      let target = null, best = 25;
      for (const m of b.mirror.ents.values()) if (m.kind === 'monster' && m.hp > 0) { const d = Math.hypot(m.x - e.x, m.z - e.z); if (d < best) { best = d; target = m; } }
      let g = b.road.pts[b.k];
      let gx = g[0], gz = g[1];
      if (target) { gx = target.x; gz = target.z; if (best < 2.6) b.cast({ slot: 0, target: target.id }); if (next(b.rng) < 0.05) b.cast({ slot: 1, target: target.id }); }
      const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz);
      if (!target && d < 3) { b.k += b.dir; if (b.k <= 0 || b.k >= b.road.pts.length - 1) b.dir = -b.dir; }
      b.input({ s: ++b.s, dt: 50, mx: d > 1.5 ? dx / d : 0, mz: d > 1.5 ? dz / d : 0, yaw: Math.atan2(dx, dz), b: 0 });
    }
    await run(clock, 50, 50);
  };
  for (let i = 0; i < 100; i++) await step();
  const t0 = world.tickStats.summary().ticks;
  let bodiesMax = 0, monstersMax = 0;
  for (let i = 0; i < 1200; i++) {
    await step();
    if (i % 100 === 0) { if (room.packs) bodiesMax = Math.max(bodiesMax, room.packs.stats().bodies); let mm = 0; for (const e of room.entities.values()) if (e.kind === 'monster' && !e.dead) mm++; monstersMax = Math.max(monstersMax, mm); }
  }
  const st = world.tickStats.summary();
  const wild = Object.fromEntries(Object.entries(world.counters || {}).filter(([k]) => /^wild_[a-z]+$/.test(k)));
  const out = { on, p50: st.p50, p95: st.p95, p99: st.p99, max: st.max, ticks: st.ticks - t0, packBodiesMax: bodiesMax, monstersMax, packs: room.packs ? room.packs.stats() : null, wild, load: loadavg()[0].toFixed(1), rulesErrors: world.status().rulesErrors };
  for (const b of bots) b.close();
  await srv.stop();
  return out;
}

test(`${N} bots on the real province's roads for 60 s: the packs and wild events add little to the tick (p99 within 30% + 2 ms of the same bots without them)`, { timeout: 900000, skip: !PERF && 'timing gate: TV_PERF=1' }, async () => {
  const off = await measure(false);
  const on = await measure(true);
  for (const r of [off, on]) console.log(`# ${r.on ? 'ON ' : 'OFF'}: tick p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} ms over ${r.ticks} ticks; monsters in the room at most ${r.monstersMax}, pack bodies at most ${r.packBodiesMax}; load ${r.load}; rulesErrors ${r.rulesErrors}${r.packs ? '; packs ' + JSON.stringify(r.packs) : ''}${Object.keys(r.wild).length ? '; events ' + JSON.stringify(r.wild) : ''}`);
  assert.ok(on.p99 <= off.p99 * 1.3 + 2, `p99 with packs ${on.p99} vs ${off.p99} without`);
  assert.equal(on.rulesErrors, 0);
});
