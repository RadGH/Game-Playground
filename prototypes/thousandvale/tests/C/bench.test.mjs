// node --test prototypes/thousandvale/tests/C/bench.test.mjs
//
// M0 MICRO-BENCHMARKS (PLAN §6.1, §8.7): how many casts one core resolves a second, and what one
// monster's think costs. PLAN §8.7 budgets 50 µs per cast-with-targets and 4 µs per monster think;
// these print the measured numbers (t.diagnostic) and fail only far outside them, so a slow VM does
// not go red but a 10x mistake does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

test('basic attacks resolved per second (one swing into a pack of 5)', async t => {
  const engine = await engineFor(3);
  const room = roomFor(engine, { seed: 3 });
  const p = createCharacter(engine, { id: 'p', classId: 'warrior', level: 30, rng: makeRng(3) });
  room.field.add(p, 'player');
  const def = engine.enemyDef('moor_hound');
  const refill = () => room.run(() => {
    for (const m of [...room.field.monsters]) room.field.remove(m);
    for (let i = 0; i < 5; i++) { const m = spawnMonster(room.field, def, 60, (i - 2) * 0.6, 2); m.hp = m.maxHp = 1e9; }
  });
  refill();
  const N = 20000;
  let hits = 0;
  const t0 = process.hrtime.bigint();
  room.run(() => { for (let i = 0; i < N; i++) hits += room.combat.resolveSwing(p, 'main', i, p.equipment.weapon).length; });
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  room.field.drain();
  t.diagnostic(`${(1e6 / us).toFixed(0)} swings/s (${us.toFixed(1)} µs each, ${(hits / N).toFixed(1)} bodies hit per swing, ${(us / (hits / N)).toFixed(1)} µs per hit)`);
  assert.ok(hits / N >= 4, 'the swing reached the pack');
  assert.ok(us < 500, `a swing took ${us.toFixed(1)} µs`);
});

test('monster think cost (a chasing pack of 12 around one player)', async t => {
  const engine = await engineFor(4);
  const room = roomFor(engine, { seed: 4 });
  const p = createCharacter(engine, { id: 'p', classId: 'knight', level: 50, rng: makeRng(4) });
  p.hp = p.maxHp = 1e9;
  room.field.add(p, 'player');
  const def = engine.enemyDef('moor_hound');
  room.run(() => { for (let i = 0; i < 12; i++) spawnMonster(room.field, def, 1, Math.cos(i) * 8, Math.sin(i) * 8); });
  const ticks = 4000;
  const t0 = process.hrtime.bigint();
  room.run(() => { for (let k = 0; k < ticks; k++) { room.clock.advance(0.05); tickMonsters(room.field, 0.05); if (k % 100 === 0) room.field.drain(); } });
  const us = Number(process.hrtime.bigint() - t0) / 1000 / (ticks * 12);
  t.diagnostic(`${us.toFixed(2)} µs per monster per tick (PLAN §8.7 assumes 4 µs)`);
  assert.ok(room.field.monsters.every(m => m.state === 'chase'), 'they were all fighting');
  assert.ok(us < 60, `${us.toFixed(1)} µs per monster think`);
});
