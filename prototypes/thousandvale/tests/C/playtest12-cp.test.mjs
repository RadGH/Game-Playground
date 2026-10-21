// node --test prototypes/thousandvale/tests/C/playtest12-cp.test.mjs
//
// Play-test 12, stream CP (~/claude/agent/mmo/round-playtest12.md) — the combat rules:
//   #78  a monster's projectile does not home: it flies at a point (with a little lead) and you can step out of it
//   #75  monsters run when they chase, some sprint; auto-attacking on the move slows YOU to 0.75 (IN.FIGHT)
//   #90  Scattered Stars throws its stars one after another, not as one fan on one frame
// The RULES are pinned (who outruns whom, "a still target is hit, a moving one is missed"), not the tuning numbers:
// every number below is read from the engine's own tables.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { stepMove, MOVE } from '../../js/sim/movement.js';
import { IN } from '../../js/net/protocol.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { chaseSpeed } from '../../js/rules/monster-ai.js';
import { parityEngineFor } from './setup.mjs';

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const TICK_MS = 50;
let n = 0;
function world() {
  const events = [];
  const id = `pt12-${++n}`;
  const room = createRoom({ id, terrain, seed: 41, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, award: () => {} } });
  const w = { room, events, tick: 0 };
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, tick: w.tick }); return ev0(ev); };
  let pid = 60;
  // a stand-in connection (every method a no-op) so the room queues this player's movement inputs
  const conn = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (k === 'then' ? undefined : () => {})), set: (o, k, v) => { o[k] = v; return true; } });
  w.add = (cls, level = 10) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX, z: SZ }, conn());
  w.mob = (type, dx, dz, level = 8) => room.spawn({ kind: 'monster', type, level, x: SX + dx, z: SZ + dz, data: { noRank: true } });
  w.steps = (k = 1) => { for (let i = 0; i < k; i++) { room.step(); w.tick++; } };
  return w;
}
const isShot = (e, m) => e.type === 'fx' && e.kind === 'shot' && e.id === m.id && !e.cosmetic;
const tough = e => { e.r.unit.maxHp = e.r.unit.hp = 1e7; };

// ============================================================================ #78

test('#78: a monster leads a moving target only partly — a player who keeps strafing is missed; one who stands still is hit', () => {
  const A = engine.projectiles.monsterAim;
  assert.ok(A && !A.home, 'monster shots are aimed, not homing');
  const w = world();
  const me = w.add('knight', 15); tough(me);
  const m = w.mob('brigand_archer', 0, 16);
  // strafe across the line of fire at a run, turning round every 1.5 s (a player dodging), for 20 s
  let s = 0, dir = 1, moved = 0;
  for (let i = 0; i < 400; i++) {
    if (i % 30 === 0) dir = -dir;
    w.room.input(me, { s: ++s, dt: TICK_MS, mx: dir, mz: 0, yaw: 0, b: IN.SPRINT });
    w.steps(1); moved++;
    if (Math.abs(me.x - SX) > 14) { me.moveTo(SX, me.z, undefined, true); }
  }
  const shots = w.events.filter(e => isShot(e, m));
  const hits = w.events.filter(e => e.type === 'hit' && e.s === m.id && e.d === me.id && e.skill === 'shot');
  assert.ok(shots.length >= 6, `${shots.length} shots at a strafing target`);
  // the shots LEAD: an aimed point is not simply where the target stood when the arrow left
  assert.ok(shots.some(f => typeof f.to === 'object' && f.aimAt === me.id), 'aimed at a point, naming its mark');
  assert.ok(hits.length <= shots.length / 2, `a strafing player is missed by most shots (${hits.length} of ${shots.length} hit)`);
  // the same archer against a target that stands still: every shot lands
  const w2 = world();
  const me2 = w2.add('knight', 15); tough(me2);
  const m2 = w2.mob('brigand_archer', 0, 16);
  w2.steps(400);
  const s2 = w2.events.filter(e => isShot(e, m2)).length, h2 = w2.events.filter(e => e.type === 'hit' && e.s === m2.id && e.d === me2.id && e.skill === 'shot').length;
  assert.ok(s2 >= 6 && h2 >= s2 - 1, `a still target is hit by every shot that has landed (${h2} of ${s2})`);
});

test('#78: a parity engine (no projectile table) keeps Farhold\'s own aimed shot', async () => {
  const e = await parityEngineFor(3);
  assert.equal(e.projectiles, null);
});

// ============================================================================ #75

test('#75: a chasing monster RUNS — faster than its bestiary stroll, inside the pursuit band; a parity engine keeps Farhold\'s speed', () => {
  const Pu = engine.combatCfg.pursuit;
  const field = { room: { engine }, clock: 0, emit: () => {} };
  const brute = { speed: 2.4, role: 'brute', kind: 'beast', rank: 'normal', reach: 2.4 };
  const drake = { speed: 3.8, role: 'brute', kind: 'beast', rank: 'normal', reach: 4 };
  const runner = { x: 10, z: 0, mvx: 8, mvz: 0 }, still = { x: 10, z: 0, mvx: 0, mvz: 0 }, toward = { x: 10, z: 0, mvx: -8, mvz: 0 };
  for (const m of [brute, drake]) { m.x = 0; m.z = 0; }
  assert.equal(chaseSpeed(field, drake, 10, toward), drake.speed, 'a player walking IN to fight is met at the old pace');
  assert.equal(chaseSpeed(field, drake, 10, still), drake.speed, 'a player who stands and fights is walked up to, as before');
  const v1 = chaseSpeed(field, brute, 10, runner), v2 = chaseSpeed(field, drake, 10, runner);
  assert.ok(v1 >= Pu.chaseMin - 1e-9 && v1 > brute.speed, `a slow brute closes at ${v1}`);
  assert.ok(v2 > drake.speed && v2 <= Pu.chaseMax + 1e-9, `a drake closes at ${v2}`);
  // a player who stops attacking outruns every monster that does not sprint
  assert.ok(MOVE.sprint > Pu.chaseMax, `running (${MOVE.sprint}) beats the fastest chase (${Pu.chaseMax})`);
  // ... but one who keeps auto-attacking on the move does NOT outrun the faster chasers
  assert.ok(MOVE.sprint * MOVE.fight < Pu.chaseMax, `attacking on the move (${MOVE.sprint * MOVE.fight}) is caught by a fast chaser (${Pu.chaseMax})`);
  // the run LATCHES: a monster that has closed to just outside reach on a kiter keeps running (it does not drop to a walk
  // at `gapAbove` and hover there forever)
  assert.ok(chaseSpeed(field, drake, drake.reach + 1, runner) > drake.speed, 'still running just outside reach');
  assert.equal(chaseSpeed(field, drake, drake.reach - 0.1, runner), drake.speed, 'in reach: the run is over');
  assert.equal(chaseSpeed(field, drake, drake.reach + 1, runner), drake.speed, '... and needs a real gap to start again');
  const pf = { room: { engine: { combatCfg: null } }, clock: 0, emit: () => {} };
  assert.equal(chaseSpeed(pf, drake, 10, runner), drake.speed, 'parity: Farhold\'s own speed');
});

test('#75: SOME monsters sprint — a skirmisher or a rare that has fallen behind bursts past your run for a moment, then must wait', () => {
  const Pu = engine.combatCfg.pursuit;
  const evs = [];
  const field = { room: { engine }, clock: 0, emit: e => evs.push(e) };
  const wolf = { id: 1, speed: 4.4, role: 'skirmisher', kind: 'beast', rank: 'normal', reach: 2.2 };
  const champ = { id: 2, speed: 3, role: 'brute', kind: 'beast', rank: 'rare', reach: 2.4 };
  const plain = { id: 3, speed: 3, role: 'brute', kind: 'beast', rank: 'normal', reach: 2.4 };
  const T = { x: 0, z: 20, mvx: 0, mvz: 7 };
  for (const m of [wolf, champ, plain]) { m.x = 0; m.z = 0; }
  assert.ok(chaseSpeed(field, wolf, 2, T) < Pu.sprintSpeed, 'no sprint when it is already close');
  assert.equal(chaseSpeed(field, wolf, 20, T), Pu.sprintSpeed, 'fallen behind: it sprints');
  assert.ok(Pu.sprintSpeed > MOVE.sprint, 'a sprint is faster than your run');
  assert.equal(chaseSpeed(field, champ, 20, T), Pu.sprintSpeed, 'a rare sprints too');
  assert.ok(chaseSpeed(field, plain, 20, T) < MOVE.sprint, 'an ordinary brute never sprints');
  assert.equal(chaseSpeed(field, { ...wolf, id: 9, speed: 0 }, 20, T), 0, 'a body that cannot walk (a dummy) never runs');
  assert.ok(evs.some(e => e.kind === 'sprint' && e.id === 1), 'the sprint is told to the clients (dust at its feet)');
  field.clock = Pu.sprintSec + 0.01;
  assert.ok(chaseSpeed(field, wolf, 20, T) < Pu.sprintSpeed, 'the burst ends');
  field.clock = Pu.sprintEverySec + 0.01;
  assert.equal(chaseSpeed(field, wolf, 20, T), Pu.sprintSpeed, 'and comes again after its wait');
});

test('#75: IN.FIGHT slows a step to MOVE.fight; swimming is not slowed twice', () => {
  const t = { heightAt: () => 0 };
  const a = stepMove({ x: 0, y: 0, z: 0, vy: 0 }, { mx: 1, mz: 0, b: IN.SPRINT }, 100, t);
  const b = stepMove({ x: 0, y: 0, z: 0, vy: 0 }, { mx: 1, mz: 0, b: IN.SPRINT | IN.FIGHT }, 100, t);
  assert.ok(Math.abs(b.x / a.x - MOVE.fight) < 1e-9, `${b.x} vs ${a.x}`);
  assert.ok(MOVE.fight > 0.5 && MOVE.fight < 1);
});

test('#75: the server slows you after a basic attack even if the client leaves IN.FIGHT off — and not once the moment has passed', () => {
  const w = world();
  const me = w.add('warrior', 15);
  const m = w.mob('moor_hound', 0, 1.6);
  m.r.unit.speed = 0;
  w.steps(2);
  let s = 0;
  const walk = k => { const x0 = me.x; for (let i = 0; i < k; i++) { w.room.input(me, { s: ++s, dt: TICK_MS, mx: 1, mz: 0, yaw: Math.PI / 2, b: IN.SPRINT }); w.steps(1); } return (me.x - x0) / (k * TICK_MS / 1000); };
  const free = walk(6);
  w.room.intent(me, { t: 'cast', slot: 0, target: m.id });
  const fighting = walk(6);
  w.steps(30);
  const after = walk(6);
  assert.ok(Math.abs(fighting / free - MOVE.fight) < 0.05, `right after a swing: ${fighting.toFixed(2)} vs ${free.toFixed(2)} m/s`);
  assert.ok(Math.abs(after - free) < 0.1, `a moment later: full pace again (${after.toFixed(2)})`);
});

// ============================================================================ #90

test('#90: Scattered Stars throws its stars ONE AFTER ANOTHER — each its own projectile event, spaced by volleyEvery, every one a hit', () => {
  const w = world();
  const me = w.add('starcaller', 16);
  const u = me.r.unit;
  const k = u.skills.slots.findIndex(sl => sl?.id === 'star_volley');
  assert.ok(k >= 0, 'a level-16 Starcaller has Scattered Stars');
  const m = w.mob('moor_hound', 0, 12, 10);
  m.r.unit.maxHp = m.r.unit.hp = 1e6; m.r.unit.speed = 0;
  w.steps(2);
  u.mp = u.maxMp; u.skills.slots[k].ready = 0;
  const res = w.room.intent(me, { t: 'cast', slot: k + 1, target: m.id, aim: { x: m.x, z: m.z } });
  assert.ok(res.ok, JSON.stringify(res));
  w.steps(60);
  const stars = w.events.filter(e => e.type === 'fx' && e.kind === 'bolt' && e.skill === 'star_volley' && e.id === me.id && !e.hop);
  const n = u.skills.slots[k].projectiles || 3;
  assert.ok(stars.length >= 3, `${stars.length} stars thrown`);
  const ticks = [...new Set(stars.map(e => e.tick))];
  assert.equal(ticks.length, stars.length, `each star leaves on its own tick (${stars.map(e => e.tick).join(', ')})`);
  for (let i = 1; i < ticks.length; i++) assert.ok((ticks[i] - ticks[i - 1]) * TICK_MS >= 100, 'a beat apart, magic-missile style');
  const hits = w.events.filter(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.ab === 'star_volley');
  assert.ok(hits.length >= 3, `${hits.length} stars landed`);
  void n;
});
