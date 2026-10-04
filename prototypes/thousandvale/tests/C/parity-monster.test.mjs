// node --test prototypes/thousandvale/tests/C/parity-monster.test.mjs
//
// M0 PARITY FIXTURE: one monster family's brain. A moor hound pack (and a straggler out of range)
// around a standing player, ticked 20 times a second for 15 seconds by Farhold's REAL
// EnemyField.update (with main.js's onEnemyStrike, transcribed in farhold-oracle.mjs) and by
// Thousandvale's js/rules/monster-ai.js. Every tick: the same positions, facings, states and
// health on every hound, the same health on the player, and the rngs in step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from './farhold-oracle.mjs';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

async function pair({ seed, pack, classId = 'warrior', level = 10, px = 0, pz = 0 }) {
  const F = O.farholdRpg(seed);
  const fp = O.farholdCharacter(F, classId, level, O.makeRng(seed + 100));
  const ff = O.farholdField(F, seed);
  ff.oraclePlayer = fp;
  const fm = pack.map(([id, lvl, x, z]) => O.farholdAdd(ff, F.enemies.enemies.find(d => d.id === id), lvl, x, z));

  const engine = await engineFor(seed);
  const room = roomFor(engine, { rng: makeRng(seed) });
  const tp = createCharacter(engine, { id: 'p1', classId, level, rng: makeRng(seed + 100), x: px, z: pz });
  tp.roomRng = room.rng;
  room.field.add(tp, 'player');
  const tm = pack.map(([id, lvl, x, z], i) => spawnMonster(room.field, engine.enemyDef(id), lvl, x, z, { id: `m${i}` }));
  return { F, fp, ff, fm, room, tp, tm, control: { x: px, z: pz, yaw: 0 } };
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function compare(s, tick) {
  for (let i = 0; i < s.fm.length; i++) {
    const f = s.fm[i], t = s.tm[i];
    const at = `tick ${tick} hound ${i}`;
    assert.equal(t.state, f.state, `${at}: state`);
    assert.ok(near(t.x, f.x) && near(t.z, f.z), `${at}: position ${t.x},${t.z} vs ${f.x},${f.z}`);
    assert.ok(near(t.facing, f.facing), `${at}: facing`);
    assert.equal(t.hp, f.hp, `${at}: hp`);
    assert.ok(near(t.swingTimer, f.swingTimer), `${at}: swing clock`);
  }
  assert.equal(s.tp.hp, s.fp.hp, `tick ${tick}: player hp`);
}

for (const seed of [3, 8, 21, 55]) {
  test(`seed ${seed}: a moor hound pack noticing, closing, surrounding and biting — tick for tick`, async () => {
    const pack = [['moor_hound', 2, 9, 4], ['moor_hound', 2, 11, 6], ['moor_hound', 2, 8, 8], ['moor_hound', 1, -45, 3]];
    const s = await pair({ seed, pack });
    const dt = 1 / 20;
    let bites = 0;
    for (let tick = 0; tick < 300; tick++) {
      s.ff.update(dt, s.control, s.fp, { onEnemyStrike: e => { bites++; O.farholdEnemyStrike(s.F, s.ff, s.fp, e); } });
      s.room.clock.advance(dt);
      s.room.run(() => tickMonsters(s.room.field, dt));
      compare(s, tick);
    }
    assert.ok(bites > 5, `the pack bit ${bites} times`);
    assert.ok(s.fp.hp < s.fp.maxHp, 'the player was hurt');
    assert.equal(s.tm[3].state, 'wander', 'the straggler 45 m away never noticed');
    assert.equal(s.room.rng(), s.ff.rng(), 'the rngs are in step');
  });
}

test('the player fights back: swings and bites interleaved, the pack dies the same way', async () => {
  const pack = [['moor_hound', 1, 4, 3], ['moor_hound', 1, 5, 4], ['moor_hound', 1, 3, 5]];
  const s = await pair({ seed: 13, pack, level: 6 });
  const dt = 1 / 20;
  for (let tick = 0; tick < 400; tick++) {
    s.ff.update(dt, s.control, s.fp, { onEnemyStrike: e => O.farholdEnemyStrike(s.F, s.ff, s.fp, e) });
    s.room.clock.advance(dt);
    s.room.run(() => tickMonsters(s.room.field, dt));
    if (tick % 12 === 0) {
      // face the nearest live hound and swing, on both sides
      const live = s.fm.filter(e => e.dying == null);
      if (live.length) {
        const tgt = live.reduce((a, b) => (Math.hypot(a.x, a.z) <= Math.hypot(b.x, b.z) ? a : b));
        const yaw = Math.atan2(tgt.x - s.control.x, tgt.z - s.control.z);
        s.control.yaw = yaw; s.tp.yaw = yaw;
        const step = Math.floor(tick / 12);
        O.farholdSwing(s.F, s.ff, s.control, s.fp, 'main', step);
        s.room.run(() => s.room.combat.resolveSwing(s.tp, 'main', step, s.tp.equipment.weapon));
      }
    }
    compare(s, tick);
  }
  assert.ok(s.fm.every(e => e.dying != null || e.removed), 'the pack is dead');
  assert.equal(s.tp.xp, s.fp.xp, 'the same experience');
});
