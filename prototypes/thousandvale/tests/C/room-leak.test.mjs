// node --test prototypes/thousandvale/tests/C/room-leak.test.mjs
//
// The ROOM-CONTEXT LEAK TEST (PLAN §6.1, review B1). Farhold's skillmech keeps traps, posts,
// banners, corpses and walls in one module-level `world`, and skills.js keeps its status hooks in
// module variables. Two rooms stepped one after the other on the same thread must never see each
// other's objects — not while running, not after, not by array replacement, not by nesting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { activeRoom } from '../../js/rules/room.js';
import {
  mechWorld, placeObject, addCorpse, takeCorpses, addWall, crossesWall, mechEnv, applyStatus, tickStatuses,
} from '../../js/rules/farhold.js';

test('two rooms never see each other\'s corpses, placed objects or walls', async () => {
  const engine = await engineFor(1);
  const A = roomFor(engine, { id: 'A', seed: 1 });
  const B = roomFor(engine, { id: 'B', seed: 2 });

  A.run(() => {
    addCorpse(1, 1); addCorpse(2, 2);
    placeObject({ kind: 'trap', radius: 2, seconds: 30 }, { x: 5, z: 5, owner: 'snare' });
    addWall({ x1: -5, z1: 0, x2: 5, z2: 0, left: 10 });
  });
  B.run(() => {
    assert.equal(mechWorld.corpses.length, 0, 'B sees none of A\'s corpses');
    assert.equal(mechWorld.placed.length, 0, 'B sees none of A\'s traps');
    assert.equal(mechWorld.walls.length, 0, 'B sees none of A\'s walls');
    assert.equal(crossesWall(0, -1, 0, 1), null, 'A\'s wall does not block a step in B');
    addCorpse(9, 9);
    placeObject({ kind: 'zone', radius: 4, seconds: 30 }, { x: 0, z: 0, owner: 'sanctuary' });
  });
  A.run(() => {
    assert.equal(mechWorld.corpses.length, 2);
    assert.equal(mechWorld.placed.length, 1);
    assert.equal(mechWorld.placed[0].owner, 'snare');
    assert.ok(crossesWall(0, -1, 0, 1), 'A\'s wall still stands in A');
  });
  // outside any room the module slots hold nothing of either
  assert.equal(mechWorld.corpses.length, 0);
  assert.equal(mechWorld.placed.length, 0);
  assert.equal(mechWorld.walls.length, 0);
  assert.equal(A.mech.corpses.length, 2);
  assert.equal(B.mech.corpses.length, 1);
});

test('a skillmech call that REPLACES the array (takeCorpses) is read back into the right room', async () => {
  const engine = await engineFor(1);
  const A = roomFor(engine, { id: 'A' });
  const B = roomFor(engine, { id: 'B' });
  A.run(() => { addCorpse(0, 0); addCorpse(1, 0); addCorpse(50, 0); });
  B.run(() => { addCorpse(0, 0); });
  const took = A.run(() => takeCorpses(0, 0, 5));
  assert.equal(took.length, 2);
  assert.equal(A.mech.corpses.length, 1, 'A kept only the far corpse');
  assert.equal(B.mech.corpses.length, 1, 'B untouched');
  A.run(() => assert.equal(mechWorld.corpses.length, 1));
});

test('object ids are per room, and the skillmech ENV is the room\'s own', async () => {
  const engine = await engineFor(1);
  const A = roomFor(engine, { id: 'A' });
  const B = roomFor(engine, { id: 'B' });
  const a1 = A.run(() => placeObject({ seconds: 5 }, { x: 0, z: 0, owner: 'x' }));
  const b1 = B.run(() => placeObject({ seconds: 5 }, { x: 0, z: 0, owner: 'x' }));
  const a2 = A.run(() => placeObject({ seconds: 5 }, { x: 0, z: 0, owner: 'x' }));
  assert.equal(a1.id, 1); assert.equal(b1.id, 1); assert.equal(a2.id, 2);
  A.run(() => assert.equal(mechEnv(), A.env));
  B.run(() => assert.equal(mechEnv(), B.env));
  assert.notEqual(mechEnv(), A.env);
});

test('status events land in the room that applied them', async () => {
  const engine = await engineFor(1);
  const A = roomFor(engine, { id: 'A' });
  const B = roomFor(engine, { id: 'B' });
  const unitA = { id: 'u', hp: 100, maxHp: 100 };
  const unitB = { id: 'v', hp: 100, maxHp: 100 };
  A.run(() => applyStatus(unitA, 'burn', engine.statuses.burn, 10));
  B.run(() => applyStatus(unitB, 'chill', engine.statuses.chill, 1));
  // let both expire inside their own rooms
  A.run(() => { for (let i = 0; i < 40; i++) tickStatuses(unitA, 0.5); });
  B.run(() => { for (let i = 0; i < 40; i++) tickStatuses(unitB, 0.5); });
  const ea = A.drainEvents(), eb = B.drainEvents();
  assert.ok(ea.length > 0 && eb.length > 0);
  assert.ok(ea.every(e => e.unit === unitA), 'A heard only about its own unit');
  assert.ok(eb.every(e => e.unit === unitB), 'B heard only about its own unit');
});

test('running one room inside another is refused; the same room may re-enter', async () => {
  const engine = await engineFor(1);
  const A = roomFor(engine, { id: 'A' });
  const B = roomFor(engine, { id: 'B' });
  assert.throws(() => A.run(() => B.run(() => {})), /tried to run inside/);
  assert.equal(activeRoom(), null, 'a throw still restores the slots');
  assert.equal(mechWorld.placed.length, 0);
  A.run(() => A.run(() => addCorpse(0, 0)));
  assert.equal(A.mech.corpses.length, 1);
});

test('a full fight in each of two rooms, interleaved tick by tick, matches each fought alone', async () => {
  const { createCharacter } = await import('../../js/rules/character.js');
  const { spawnMonster, tickMonsters } = await import('../../js/rules/monster-ai.js');
  const { makeRng } = await import('../../js/rules/rng.js');
  const setup = async (id, seed) => {
    const engine = await engineFor(seed);
    const room = roomFor(engine, { id, seed });
    const p = createCharacter(engine, { id: 'p', classId: 'warrior', level: 5, rng: makeRng(seed) });
    p.roomRng = room.rng;
    room.field.add(p, 'player');
    for (let i = 0; i < 3; i++) spawnMonster(room.field, engine.enemyDef('moor_hound'), 3, 4 + i, 3);
    return { room, p };
  };
  const step = (s, k) => s.room.run(() => {
    s.room.clock.advance(0.05);
    tickMonsters(s.room.field, 0.05);
    if (k % 10 === 0) s.room.combat.attack(s.p, { yaw: Math.atan2(4, 3) });
    s.room.combat.tick(0.05);
  });
  const alone = await setup('solo', 4);
  for (let k = 0; k < 200; k++) step(alone, k);
  const a = await setup('A', 4), b = await setup('B', 9);
  for (let k = 0; k < 200; k++) { step(a, k); step(b, k); }
  assert.ok(alone.p.hp < alone.p.maxHp && alone.room.field.monsters.some(m => m.hp < m.maxHp || m.dying != null), 'a real fight happened');
  assert.equal(a.p.hp, alone.p.hp);
  assert.deepEqual(a.room.field.monsters.map(m => m.hp), alone.room.field.monsters.map(m => m.hp));
  assert.equal(a.room.mech.corpses.length, alone.room.mech.corpses.length);
});
