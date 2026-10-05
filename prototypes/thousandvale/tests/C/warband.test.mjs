// node --test prototypes/thousandvale/tests/C/warband.test.mjs
//
// WARBANDS (js/rules/warband.js, forked from Farhold actors.js R27 M10 + R28): a leader brings two of
// each escort type and its standard-bearer; while it stands the escort hits 15% harder (the leader
// aura, folded in once); the bearer's death ends the aura; the leader's death ends it AND routs the
// escort (at least one breaks, runs for 6 s, comes back); and a monster with a built piece between it
// and its target walks up and breaks the piece. Plus the escort as real entities in stream A's room.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { attachWarbands, escortFor, followersOf } from '../../js/rules/warband.js';
import { makeRng } from '../../js/rules/rng.js';
import { addThreat } from '../../js/rules/threat.js';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';

const ENGINE = await engineFor(4);
const DT = 0.05;

function band(seed = 4) {
  const room = roomFor(ENGINE, { seed });
  const field = room.field;
  attachWarbands(field, {
    cfg: ENGINE.balance.warbands,
    spawn: (id, x, z, level, rank) => spawnMonster(field, ENGINE.enemyDef(id), level, x, z, { rank }),
  });
  const def = ENGINE.enemyDef('sootwick_ringleader');
  const leader = room.run(() => spawnMonster(field, def, 8, 0, 0));
  const escort = room.run(() => escortFor(field, leader, def));
  const step = n => { for (let i = 0; i < n; i++) room.run(() => { room.clock.advance(DT); tickMonsters(field, DT); }); };
  return { room, field, def, leader, escort, step };
}

test('the warbands are in the bestiary (five bands, their leaders and bearers)', () => {
  assert.ok(ENGINE.enemyDef('sootwick_ringleader')?.leads?.length);
  assert.ok(ENGINE.enemyDef('sootwick_bearer')?.banner);
  assert.equal(ENGINE.bestiary.warbands.warbands.length, 5);
});

test('a leader brings 2 of each escort type and its bearer; while it stands they hit 15% harder', () => {
  const { field, def, leader, escort, room } = band();
  const ids = escort.map(u => u.defId).sort();
  assert.deepEqual(ids, [...def.leads.flatMap(id => [id, id]), 'sootwick_bearer'].sort());
  assert.ok(leader.leads);
  for (const u of escort) assert.equal(u.leader, leader.id);
  assert.ok(escort.find(u => u.defId === 'sootwick_bearer').bearer);
  const plain = room.run(() => spawnMonster(field, ENGINE.enemyDef('sootwick_basher'), 8, 30, 30));
  const led = escort.find(u => u.defId === 'sootwick_basher' && u.rank === 'normal');
  const k = ENGINE.balance.warbands.leaderAura;
  assert.ok(Math.abs(led.dmg[0] - plain.dmg[0] * k) < 1e-9 && Math.abs(led.dmg[1] - plain.dmg[1] * k) < 1e-9, 'aura folded into dmg once');
});

test('the standard-bearer falls: the aura ends (damage back to the last decimal), nobody routs', () => {
  const { field, escort, room } = band();
  const led = escort.filter(u => u.defId === 'sootwick_basher');
  const before = led.map(u => u.dmg.slice());
  const bearer = escort.find(u => u.bearer);
  room.run(() => field.kill(bearer));
  const k = ENGINE.balance.warbands.leaderAura;
  led.forEach((u, i) => { assert.ok(Math.abs(u.dmg[0] - before[i][0] / k) < 1e-9); assert.ok(!u.routed); });
});

test('the leader falls: the aura ends and the escort routs — at least one runs for 6 s, then comes back', () => {
  const { field, leader, escort, room, step } = band();
  const engine = ENGINE;
  const p = createCharacter(engine, { id: 'p', classId: 'warrior', level: 8, rng: makeRng(1), x: 3, z: 3 });
  p.roomRng = room.streams.get('bars'); p.hp = p.maxHp = 1e9;
  field.add(p, 'player');
  for (const u of [leader, ...escort]) { addThreat(u, p, 10); u.state = 'chase'; }
  room.run(() => field.kill(leader));
  const fled = escort.filter(u => u.routed && u.state === 'flee');
  assert.ok(fled.length >= 1, 'at least one broke');
  for (const u of fled) assert.ok(u.fleeFor >= engine.balance.warbands.routSeconds - 1e-9);
  assert.deepEqual(followersOf(field, leader.id), [], 'nobody follows a dead leader');
  step(Math.round((engine.balance.warbands.routSeconds + 1) / DT));
  for (const u of fled) assert.ok(!u.routed && u.state === 'chase', 'the runner got its nerve back');
});

test('SIEGE: a built piece across the line to the player is walked up to and broken, then the monster goes on', () => {
  const room = roomFor(ENGINE, { seed: 2 });
  const field = room.field;
  attachWarbands(field, { cfg: ENGINE.balance.warbands });
  const wall = { id: 'gate1', x: 6, z: 0, hp: 3 };
  // the piece on the segment between the two points, as Farhold's buildplan `blockingPiece` answers
  field.structures = (ax, az, bx, bz) => (wall.hp > 0 && Math.min(ax, bx) < wall.x && Math.max(ax, bx) > wall.x ? { id: wall.id, x: wall.x, z: wall.z, gap: Math.hypot(wall.x - ax, wall.z - az) } : null);
  const blows = [];
  field.strikeStructure = (e, id) => { blows.push(id); wall.hp--; return { ok: true, destroyed: wall.hp <= 0 }; };
  const p = createCharacter(ENGINE, { id: 'p', classId: 'warrior', level: 5, rng: makeRng(1), x: 14, z: 0 });
  p.roomRng = room.streams.get('bars'); p.hp = p.maxHp = 1e9;
  field.add(p, 'player');
  const m = room.run(() => spawnMonster(field, ENGINE.enemyDef('sootwick_basher'), 5, 0, 0));
  addThreat(m, p, 10); m.state = 'chase';
  let maxX = 0;
  for (let i = 0; i < 400; i++) {
    room.run(() => { room.clock.advance(DT); tickMonsters(field, DT); });
    if (wall.hp > 0) maxX = Math.max(maxX, m.x);
  }
  assert.equal(blows.length, 3, 'three swings broke the piece');
  assert.ok(maxX < wall.x, 'it did not walk through the piece while it stood');
  assert.ok(Math.hypot(m.x - p.x, m.z - p.z) < 4, 'then it went on to the player');
});

test('IN THE ROOM: a camp leader spawns its escort as room entities, each linked to it', () => {
  const terrain = standInTerrain(2, 2048);
  const sx = terrain.spawn.x + 60, sz = terrain.spawn.z + 60;
  const room = createRoom({ id: 'wb', terrain, seed: 5, camps: [{ type: 'sootwick_ringleader', x: sx, z: sz, count: 1, level: 6, radius: 2, respawnMs: 1 }], createRules, hooks: { log: () => {} } });
  for (let i = 0; i < 2; i++) room.step();
  const monsters = () => [...room.entities.values()].filter(e => e.kind === 'monster');
  const ms = monsters();
  const lead = ms.find(e => e.type === 'sootwick_ringleader');
  assert.ok(lead, 'the leader is there');
  const escort = ms.filter(e => e.data?.escortOf === lead.r.unit.id);
  assert.equal(escort.length, 5, `2 bashers, 2 slingers and a bearer (${ms.map(e => e.type).join(', ')})`);
  for (const e of escort) assert.equal(e.r.unit.leader, lead.r.unit.id);
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError);
});
