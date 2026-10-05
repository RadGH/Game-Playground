// node --test prototypes/thousandvale/tests/C/nav-block.test.mjs
//
// A baked zone's nav.bin (stream B `parseNav`): trees, rocks, buildings and deep water block a
// monster's step. The room hands it over as `host.terrain.nav`; index.js turns it into the terrain's
// `blocked(x, z)` and monster-ai.js slides a monster along a blocked sample instead of through it.
// Without `blocked` (Farhold, the parity fixtures) nothing changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { flatTerrain } from '../../js/rules/terrain-flat.js';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';
import { addThreat } from '../../js/rules/threat.js';

async function chase(blocked) {
  const engine = await engineFor(3);
  const terrain = { ...flatTerrain(), ...(blocked ? { blocked } : {}) };
  const room = roomFor(engine, { seed: 3, terrain });
  const p = createCharacter(engine, { id: 'p', classId: 'warrior', level: 10, rng: makeRng(2), x: 20, z: 0 });
  p.roomRng = room.streams.get('bars');
  room.field.add(p, 'player');
  const m = room.run(() => spawnMonster(room.field, engine.enemyDef('moor_hound'), 10, 0, 0));
  addThreat(m, p, 50);
  let crossed = false;
  for (let i = 0; i < 120; i++) {
    room.run(() => { room.clock.advance(0.05); tickMonsters(room.field, 0.05); });
    if (blocked && blocked(m.x, m.z)) crossed = true;
  }
  return { m, crossed };
}

test('a wall of solid samples between a hound and its target: it never stands inside the wall', async () => {
  // a wall 2 m thick across x = 8..10, from z = -6 to z = 6 — the hound must go round it
  const wall = (x, z) => x >= 8 && x <= 10 && z >= -6 && z <= 6;
  const { m, crossed } = await chase(wall);
  assert.equal(crossed, false, 'the hound walked into the wall');
  const open = await chase(null);
  assert.ok(open.m.x > 12, 'on open ground the same hound reaches the player');
  assert.ok(m.x < 8 || Math.abs(m.z) > 6, 'blocked, it is still on its own side or going round the end');
});
