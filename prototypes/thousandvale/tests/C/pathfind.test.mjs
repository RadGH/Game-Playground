// node --test prototypes/thousandvale/tests/C/pathfind.test.mjs
//
// MONSTER PATHFINDING (js/rules/pathfind.js) over a zone's nav.bin obstacles and cliffs: round a long
// wall to the player behind it, round a cliff band, home again round the wall after a leash, an
// enclosed target that cannot be reached (it gives up and goes home), no change at all on a terrain
// that cannot block (Farhold parity), and a perf bench at the 100-bot scale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { flatTerrain } from '../../js/rules/terrain-flat.js';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters, AI } from '../../js/rules/monster-ai.js';
import { pathfinderFor, findPath, plannerBlocked, PATH } from '../../js/rules/pathfind.js';
import { makeRng } from '../../js/rules/rng.js';
import { addThreat } from '../../js/rules/threat.js';

const ENGINE = await engineFor(3);
const DT = 0.05;

function world(extra, { players = [[20, 0]], monsters = [[0, 0]], level = 10 } = {}) {
  const terrain = { ...flatTerrain(), ...extra };
  const room = roomFor(ENGINE, { seed: 3, terrain });
  const ps = players.map(([x, z], i) => {
    const p = createCharacter(ENGINE, { id: `p${i}`, classId: 'warrior', level, rng: makeRng(2 + i), x, z });
    p.roomRng = room.streams.get('bars');
    p.hp = p.maxHp = 1e9;                    // nobody dies: we watch the walking
    room.field.add(p, 'player');
    return p;
  });
  const ms = room.run(() => monsters.map(([x, z]) => spawnMonster(room.field, ENGINE.enemyDef('moor_hound'), level, x, z)));
  for (const m of ms) addThreat(m, ps[0], 50);
  const step = (n, watch) => { for (let i = 0; i < n; i++) { room.run(() => { room.clock.advance(DT); tickMonsters(room.field, DT); }); watch?.(); } };
  return { room, ps, ms, step };
}

test('a flat terrain that cannot block gets no planner (Farhold parity untouched)', () => {
  const { room } = world({});
  assert.equal(pathfinderFor(room.field), null);
});

test('LONG WALL: a hound reaches a player behind a 50 m wall by going round it, never through', async () => {
  const wall = (x, z) => x >= 8 && x <= 10 && z >= -25 && z <= 25;
  const { ms, ps, step } = world({ blocked: wall });
  const m = ms[0];
  let inside = false, reached = -1, n = 0;
  step(400, () => { n++; if (wall(m.x, m.z)) inside = true; if (reached < 0 && Math.hypot(m.x - ps[0].x, m.z - ps[0].z) <= (m.reach || 2.4) + 0.6) reached = n; });
  assert.equal(inside, false, 'it stood inside the wall');
  assert.ok(reached > 0, `it reached the player (ended at ${m.x.toFixed(1)}, ${m.z.toFixed(1)}, state ${m.state})`);
  assert.notEqual(m.state, 'return', 'it did not give up on the way');
});

test('CLIFF: a band too steep to climb (pathing terrain, no nav) is walked round', () => {
  // a cliff band 4 m wide across x = 10..14, z -20..20 — slope over 63 degrees inside it
  const cliff = (x, z) => x >= 10 && x <= 14 && Math.abs(z) <= 20;
  const terrain = { pathing: true, slopeAt: (x, z) => (cliff(x, z) ? 5 : 0) };
  const blk = plannerBlocked({ ...flatTerrain(), ...terrain });
  const r = findPath(blk, 0, 0, 24, 0);
  assert.ok(r.reached, 'a path exists');
  assert.ok(r.pts.some(p => Math.abs(p.z) > 20), 'it goes round the end of the band');
  for (const p of r.pts) assert.ok(!cliff(p.x, p.z));
});

test('LEASH HOME: a monster pulled round the wall and then left walks home round it too', async () => {
  const wall = (x, z) => x >= 8 && x <= 10 && z >= -25 && z <= 25;
  const { room, ms, ps, step } = world({ blocked: wall }, { monsters: [[0, 0]], players: [[20, 0]] });
  const m = ms[0];
  step(300);
  assert.ok(m.x > 10, 'it got round to the player');
  ps[0].removed = true; room.field.players.splice(room.field.players.indexOf(ps[0]), 1);   // the player is gone
  m.state = 'chase';
  let inside = false;
  const { resetMonster } = await import('../../js/rules/monster-ai.js');
  room.run(() => resetMonster(room.field, m));
  step(Math.round((AI.RETURN_SNAP - 1) / DT), () => { if (wall(m.x, m.z)) inside = true; });
  assert.equal(inside, false);
  assert.ok(Math.hypot(m.x - m.home[0], m.z - m.home[1]) < 1.5, `walked home (at ${m.x.toFixed(1)}, ${m.z.toFixed(1)})`);
});

test('UNREACHABLE: a player shut in a closed box — the hound gets as close as it can, gives up, goes home', () => {
  const box = (x, z) => (Math.abs(x - 20) <= 5 && Math.abs(z) <= 5) && !(Math.abs(x - 20) <= 3 && Math.abs(z) <= 3);
  const { ms, step } = world({ blocked: box });
  const m = ms[0];
  let returned = false;
  step(Math.round((AI.LEASH_SECONDS + 6) / DT), () => { if (m.state === 'return') returned = true; if (box(m.x, m.z)) throw new Error('inside the box wall'); });
  assert.ok(returned, 'it gave up (the leash)');
});

test('PERF (100-bot gate): 100 hounds chasing 20 players through a field of walls', () => {
  // a grid of 20 m walls with gaps every 40 m: most straight lines are shut, every target reachable
  const maze = (x, z) => {
    const cx = ((x % 40) + 40) % 40, cz = ((z % 40) + 40) % 40;
    return (cx >= 19 && cx <= 21 && cz < 30) || (cz >= 19 && cz <= 21 && cx > 10);
  };
  const players = [], monsters = [];
  const rng = makeRng(9);
  // nobody starts in or against a wall (1.5 m clear), and the players never walk into one
  const clear = (x, z) => { for (let a = 0; a < 8; a++) if (maze(x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5)) return false; return !maze(x, z); };
  while (players.length < 20) { const x = rng() * 160 - 80, z = rng() * 160 - 80; if (clear(x, z)) players.push([x, z]); }
  // each hound starts 10-28 m from its own player (inside the 40 m leash), often across a wall
  while (monsters.length < 100) { const [px, pz] = players[monsters.length % 20], a = rng() * Math.PI * 2, r = 10 + rng() * 18, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; if (clear(x, z)) monsters.push([x, z]); }
  const W = world({ blocked: maze }, { players, monsters });
  W.ms.forEach((m, i) => { m.threat?.clear(); addThreat(m, W.ps[i % 20], 50); m.state = 'chase'; m.home = [m.x, m.z]; });
  // the planner's own time is measured by wrapping its `steer` (the whole tick is reported too; on a busy
  // VM the whole tick is dominated by the 100 fights, not by the planner)
  const pf = pathfinderFor(W.room.field);
  const steer = pf.steer;
  let acc = 0;
  pf.steer = (...a) => { const t0 = performance.now(); try { return steer(...a); } finally { acc += performance.now() - t0; } };
  const times = [], plan = [], got = new Set();
  for (let t = 0; t < 420; t++) {
    for (const [i, p] of W.ps.entries()) { const nx = p.x + Math.sin(t * 0.05 + i) * 0.15, nz = p.z + Math.cos(t * 0.04 + i) * 0.15; if (clear(nx, nz)) { p.x = nx; p.z = nz; } }
    acc = 0;
    const t0 = performance.now();
    W.room.run(() => { W.room.clock.advance(DT); tickMonsters(W.room.field, DT); });
    if (t >= 20) { times.push(performance.now() - t0); plan.push(acc); }   // the first second warms the JIT
    // "reached" = into the crowd round the player it is after (five hounds a player do not all fit at bite range)
    for (const m of W.ms) { const p = W.room.field.get(m.targetId); if (p && Math.hypot(p.x - m.x, p.z - m.z) <= (m.reach || 2.4) + 4) got.add(m); }
  }
  // phase 2, the stress: every hound switches to another player, mostly far off across several walls
  W.ms.forEach((m, i) => { m.threat?.clear(); addThreat(m, W.ps[(i * 7 + 3) % 20], 50); m.home = [m.x, m.z]; m.state = 'chase'; m.lastCombatAt = W.room.clock.now?.() ?? m.lastCombatAt; });
  for (let t = 0; t < 200; t++) {
    acc = 0;
    const t0 = performance.now();
    W.room.run(() => { W.room.clock.advance(DT); tickMonsters(W.room.field, DT); });
    times.push(performance.now() - t0); plan.push(acc);
  }
  const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * f)];
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const st = pf.stats;
  console.log(`# 100 monsters in a maze: planner mean ${mean(plan).toFixed(3)} ms, p95 ${q(plan, 0.95).toFixed(3)} ms, p99 ${q(plan, 0.99).toFixed(3)} ms, max ${Math.max(...plan).toFixed(2)} ms per tick (whole monster tick mean ${mean(times).toFixed(2)} ms, p99 ${q(times, 0.99).toFixed(2)}); ${st.searches} searches, ${st.cacheHits} shared, ${st.deferred} deferred, ${st.failed} partial, ${(st.expansions / 620).toFixed(0)} expansions/tick (budget ${PATH.BUDGET})`);
  assert.ok(st.searches > 50, 'paths were actually planned');
  assert.ok(mean(plan) < 1.5, `planner mean ${mean(plan).toFixed(2)} ms`);
  // p95, not p99: on this shared VM a single garbage-collector pause lands inside a steer call now and
  // then (the spikes have no expansions in them); the budget keeps a busy tick to ~2-3 ms of planning
  assert.ok(q(plan, 0.95) < 4, `planner p95 ${q(plan, 0.95).toFixed(2)} ms`);
  // the hounds reach their players through the maze (every player is reachable)
  console.log(`# ${got.size} of 100 hounds reached their target through the maze`);
  assert.ok(got.size >= 90, `${got.size} of 100 hounds reached their target`);
});
