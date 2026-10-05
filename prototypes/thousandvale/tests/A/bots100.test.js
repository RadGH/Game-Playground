// M2 gate (PLAN §15 M2): 100 bots on the province with herds — spread out, then all 100 in one town, then
// 60 at the realm event — tick p99 <= 20 ms, worst < 50 ms, bandwidth <= 8 KB/s average (town herd <= 24,
// event <= 48). In-process with the real combat core (sim cost only); stream G runs it over real sockets.
// Timing gate: runs alone (`npm run test:perf`, TV_PERF=1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createRealm } from '../../js/sim/world.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { makeClient, run, waitP } from './helpers.js';
import { seedStream, next, range } from '../../js/sim/rng.js';

const PERF = !!process.env.TV_PERF;
const root = new URL('../../', import.meta.url);

test('100 bots with herds (town 100, event 60): p99 <= 20 ms, worst < 50 ms, bandwidth in budget', { timeout: 900000, skip: !PERF && 'timing gate: npm run test:perf' }, async () => {
  let createRules;
  try { ({ createRules } = await import('../../js/rules/index.js')); } catch { createRules = undefined; }
  const C = await loadProvinceContent(async f => JSON.parse(readFileSync(new URL(f, root), 'utf8')), async f => readFileSync(new URL(f, root)), 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
  const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter });
  const clock = createVirtualClock();
  const world = createRealm({ procs: [[L]], store: createMemoryStore({ now: clock.now }), now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, ...(createRules ? { createRules } : {}) });
  const srv = createLoopbackServer({ clock, world });
  let times = [];
  const step0 = world.step.bind(world);
  world.step = () => { const t0 = performance.now(); const r = step0(); times.push(performance.now() - t0); return r; };
  await srv.ready;
  const P0 = world.procs[0], T = L.towns[0];
  const bots = [];
  for (let i = 0; i < 100; i++) {
    const b = makeClient(srv, clock);
    await waitP(clock, b.ready, 30000);
    const ch = await waitP(clock, b.createChar({ name: 'Herd ' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)) + 'x', cls: ['warrior', 'rogue', 'ranger', 'cleric'][i % 4] }), 30000);
    await waitP(clock, b.play(ch.id), 30000);
    b.rng = seedStream(i + 101, 'herd'); b.s = 0; b.bytes = 0;
    b.on('snap', s => { b.bytes += s.bytes; });
    bots.push(b);
  }
  const oOf = b => P0.online.get(b.joined.you.char);
  const camps = L.camps.filter(c => !c.encounter && c.rank !== 'boss');
  const townGoal = b => { const a = range(b.rng, 0, 6.283), d = range(b.rng, 0, T.r * 0.8); return { x: T.x + Math.cos(a) * d, z: T.z + Math.sin(a) * d }; };
  const campGoal = b => { const c = camps[Math.floor(next(b.rng) * Math.min(camps.length, 24))]; return { x: c.x + range(b.rng, -12, 12), z: c.z + range(b.rng, -12, 12) }; };
  let mode = 'spread';
  let eventGoal = b => b.goal;
  const step = async () => {
    for (const b of bots) {
      const o = oOf(b); if (!o) continue;
      const e = o.entity;
      if (e.dead) { if (next(b.rng) < 0.05) { b.respawn(); b.back = mode === 'event' && b.fight; } continue; }
      if (b.back && o.room.kind === 'town' && next(b.rng) < 0.05) { b.back = false; b.travel('event'); }
      let target = null, best = mode === 'event' ? 45 : 20;
      if (b.fight) for (const m of b.mirror.ents.values()) if (m.kind === 'monster' && m.hp > 0) { const d = Math.hypot(m.x - e.x, m.z - e.z); if (d < best) { best = d; target = m; } }
      let gx = b.goal.x, gz = b.goal.z;
      if (target) { gx = target.x; gz = target.z; if (best < (m => m.rank === 'boss' ? 4.5 : 2.6)(target)) b.cast({ slot: 0, target: target.id }); }
      const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz);
      if (!target && d < 2) b.goal = b.fight && mode !== 'town' ? (mode === 'event' ? eventGoal(b) : campGoal(b)) : townGoal(b);
      if (next(b.rng) < 0.002) b.say('well met');
      b.input({ s: ++b.s, dt: 50, mx: d > 1.5 ? dx / d : 0, mz: d > 1.5 ? dz / d : 0, yaw: Math.atan2(dx, dz), b: 0 });
    }
    await run(clock, 50, 50);
  };
  const phase = async (name, secs) => {
    for (let i = 0; i < 60; i++) await step();               // settle 3 s
    times = []; for (const b of bots) b.bytes = 0;
    for (let i = 0; i < secs * 20; i++) await step();
    const t = times.slice().sort((a, b) => a - b);
    const p = f => t[Math.min(t.length - 1, Math.floor(f * t.length))];
    const kb = list => list.reduce((a, b) => a + b.bytes, 0) / Math.max(1, list.length) / secs / 1024;
    const r = { name, p50: +p(0.5).toFixed(2), p99: +p(0.99).toFixed(2), max: +t.at(-1).toFixed(2), kbAll: +kb(bots).toFixed(2), kbFighters: +kb(bots.filter(b => b.fight)).toFixed(2), kbTown: +kb(bots.filter(b => !b.fight)).toFixed(2) };
    console.log('# ' + JSON.stringify(r));
    return r;
  };
  // A. spread: 30 milling in Torborhold, 70 out fighting at the camps
  bots.forEach((b, i) => { b.fight = i >= 30; b.goal = b.fight ? campGoal(b) : townGoal(b); if (b.fight) P0.transfer(oOf(b), P0.copies[0], { ...b.goal }, 'test'); });
  const A = await phase('spread 30 town / 70 wilds', 40);
  // B. the town herd: all 100 in Torborhold
  mode = 'town';
  for (const b of bots) { b.fight = false; b.goal = townGoal(b); P0.transfer(oOf(b), P0.townRoom, { ...b.goal }, 'test'); }
  const B = await phase('herd: 100 in one town', 30);
  // C. the event herd: 60 fight the realm event, 40 stay in town
  mode = 'event';
  world.director.force(C.events[0].id, { announce: 0 });
  await run(clock, 300);
  bots.forEach((b, i) => { if (i < 60) { b.fight = true; b.travel('event'); } });
  await run(clock, 1500);
  // the herd closes on the boss (a ring 6-14 m out) and fights it and its adds
  const ev = world.director.current.ev;
  eventGoal = b => { const a = range(b.rng, 0, 6.283), d = range(b.rng, 6, 14); return { x: ev.x + Math.cos(a) * d, z: ev.z + Math.sin(a) * d }; };
  for (const [i, b] of bots.entries()) if (i < 60) b.goal = eventGoal(b);
  const atEvent = () => bots.slice(0, 60).filter(b => { const o = oOf(b); return o && Math.hypot(o.entity.x - ev.x, o.entity.z - ev.z) < ev.r * 1.5; }).length;
  assert.ok(atEvent() >= 55, 'the event herd arrived: ' + atEvent());
  const Cc = await phase('herd: 60 at the realm event', 30);
  console.log('# event herd still in the arena: ' + atEvent() + ' of 60');
  const worst = Math.max(A.max, B.max, Cc.max);
  console.log(`# worst tick ${worst} ms; rulesErrors ${P0.status().rulesErrors}; rules ${createRules ? 'C' : 'v0'}`);
  for (const r of [A, B, Cc]) assert.ok(r.p99 <= 20, r.name + ' p99 ' + r.p99);
  assert.ok(worst < 50, 'worst tick ' + worst);
  assert.ok(A.kbAll <= 8, 'spread average ' + A.kbAll + ' KB/s');
  assert.ok(B.kbAll <= 24, 'town herd ' + B.kbAll + ' KB/s');
  assert.ok(Cc.kbFighters <= 48, 'event herd ' + Cc.kbFighters + ' KB/s');
  assert.equal(P0.status().rulesErrors, 0);
  for (const b of bots) b.close();
  await srv.stop();
});
