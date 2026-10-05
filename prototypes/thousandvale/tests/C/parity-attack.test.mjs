// node --test prototypes/thousandvale/tests/C/parity-attack.test.mjs
//
// M0 PARITY FIXTURE: one class's basic attack. The same warrior (same kit roll), the same wolf
// pack (same spawn roll), the same seed — swung at by Farhold's own EnemyField + main.js's
// swingWith (tests/C/farhold-oracle.mjs) and by Thousandvale's js/rules/cast.js — must produce the
// same hits, the same damage numbers, the same crits, the same statuses and leave both rngs in the
// same place. If Farhold changes a combat rule, this goes red in Thousandvale's suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from './farhold-oracle.mjs';
import { parityEngineFor as engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

/** Both sides set up identically. `pack` = [[defId, level, x, z], ...] around a player at 0,0 facing +z. */
async function pair({ classId = 'warrior', level = 1, pack, seed = 11, kitSeed = 5 }) {
  const F = O.farholdRpg(seed);
  const fp = O.farholdCharacter(F, classId, level, O.makeRng(kitSeed));
  const ffield = O.farholdField(F, seed);
  ffield.oraclePlayer = fp;
  const fmobs = pack.map(([id, lvl, x, z]) => O.farholdAdd(ffield, F.enemies.enemies.find(d => d.id === id), lvl, x, z));

  const engine = await engineFor(seed);
  const room = roomFor(engine, { rng: makeRng(seed) });
  const tp = createCharacter(engine, { id: 'p1', classId, level, rng: makeRng(kitSeed) });
  tp.roomRng = room.rng;
  room.field.add(tp, 'player');
  const tmobs = pack.map(([id, lvl, x, z], i) => spawnMonster(room.field, engine.enemyDef(id), lvl, x, z, { id: `m${i}` }));
  return { F, fp, ffield, fmobs, engine, room, tp, tmobs };
}

function sameSheet(a, b) {
  assert.deepEqual(b.derived.damage, a.derived.damage, 'the two characters roll the same damage range');
  assert.equal(b.equipment.weapon?.key ?? b.equipment.weapon?.base, a.equipment.weapon?.key ?? a.equipment.weapon?.base);
  assert.equal(b.maxHp, a.maxHp);
}

function sameMobs(fm, tm) {
  assert.equal(tm.length, fm.length);
  for (let i = 0; i < fm.length; i++) {
    assert.equal(tm[i].hp, fm[i].hp, `mob ${i} hp`);
    assert.equal(tm[i].maxHp, fm[i].maxHp, `mob ${i} maxHp`);
    assert.equal(tm[i].facing, fm[i].facing, `mob ${i} facing`);
    assert.deepEqual(Object.keys(tm[i].statuses || {}).sort(), Object.keys(fm[i].statuses || {}).sort(), `mob ${i} statuses`);
    assert.equal(tm[i].stagger, fm[i].stagger, `mob ${i} stagger`);
    assert.equal(!!tm[i].push, !!fm[i].push, `mob ${i} knockback`);
  }
}

const sig = hits => hits.map(h => ({ hp: h.enemy.hp, amount: h.result.amount, crit: h.result.crit, dead: h.result.dead }));

test('a level-1 warrior\'s three-strike pattern against a moor hound pack: identical in Farhold and Thousandvale', async () => {
  const pack = [['moor_hound', 1, 0, 2.2], ['moor_hound', 1, 1.2, 2.6], ['moor_hound', 1, -1.4, 2.0], ['moor_hound', 1, 0, 9]];
  const s = await pair({ pack });
  sameSheet(s.fp, s.tp);
  sameMobs(s.fmobs, s.tmobs);
  const control = { x: 0, z: 0, yaw: 0 };
  let total = 0;
  for (let step = 0; step < 6; step++) {
    const a = O.farholdSwing(s.F, s.ffield, control, s.fp, 'main', step);
    const b = s.room.run(() => s.room.combat.resolveSwing(s.tp, 'main', step, s.tp.equipment.weapon));
    assert.deepEqual(sig(b), sig(a), `step ${step}: the same bodies take the same hits`);
    sameMobs(s.fmobs, s.tmobs);
    total += a.reduce((n, h) => n + h.result.amount, 0);
  }
  assert.ok(total > 0, 'the swings landed');
  assert.equal(s.room.rng(), s.ffield.rng(), 'both rngs advanced by exactly the same rolls');
  const drops = s.room.field.drain().filter(ev => ev.t === 'reward').flatMap(ev => ev.items);
  assert.deepEqual(drops.map(d => d.name), s.ffield.drops.map(d => d.name), 'the kills dropped the same loot');
  assert.equal(s.tp.xp, s.fp.xp, 'and paid the same experience');
});

test('many seeds and levels: every swing, every hit, every crit agrees', async () => {
  let swings = 0, hits = 0, crits = 0;
  for (const seed of [1, 2, 3, 7, 19, 42]) {
    for (const level of [1, 8, 20]) {
      const pack = [['moor_hound', level, 0.4, 2.0], ['moor_hound', level, -0.8, 2.4], ['barrow_hound', Math.max(6, level), 0.9, 3.1]];
      const s = await pair({ pack, seed, level, kitSeed: seed * 3 });
      sameSheet(s.fp, s.tp);
      const control = { x: 0, z: 0, yaw: 0.1 };
      s.tp.yaw = 0.1;
      for (let step = 0; step < 9; step++) {
        const a = O.farholdSwing(s.F, s.ffield, control, s.fp, 'main', step);
        const b = s.room.run(() => s.room.combat.resolveSwing(s.tp, 'main', step, s.tp.equipment.weapon));
        assert.deepEqual(sig(b), sig(a), `seed ${seed} level ${level} step ${step}`);
        swings++; hits += a.length; crits += a.filter(h => h.result.crit).length;
      }
      sameMobs(s.fmobs, s.tmobs);
      assert.equal(s.room.rng(), s.ffield.rng(), `seed ${seed} level ${level}: rng in step`);
    }
  }
  assert.ok(hits > swings, `${hits} hits over ${swings} swings`);
  assert.ok(crits > 0, 'at least one critical was compared');
});

test('the rogue (dual daggers, backstab trait) agrees too, off hand included', async () => {
  const pack = [['moor_hound', 3, 0, 1.8], ['moor_hound', 3, 0.6, 2.2]];
  const s = await pair({ classId: 'rogue', level: 3, pack, seed: 9 });
  sameSheet(s.fp, s.tp);
  // turn the first hound away so a dagger lands in its back
  s.fmobs[0].facing = 0; s.tmobs[0].facing = 0;
  const control = { x: 0, z: 0, yaw: 0 };
  for (let step = 0; step < 4; step++) {
    for (const hand of ['main', 'off']) {
      if (hand === 'off' && !s.fp.equipment.offhand) continue;
      const a = O.farholdSwing(s.F, s.ffield, control, s.fp, hand, step);
      const weapon = hand === 'off' ? s.tp.equipment.offhand : s.tp.equipment.weapon;
      const b = s.room.run(() => s.room.combat.resolveSwing(s.tp, hand, step, weapon));
      assert.deepEqual(sig(b), sig(a), `rogue ${hand} step ${step}`);
    }
  }
  sameMobs(s.fmobs, s.tmobs);
});
