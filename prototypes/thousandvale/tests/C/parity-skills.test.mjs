// node --test prototypes/thousandvale/tests/C/parity-skills.test.mjs
//
// M1 PARITY FIXTURES: the four M1 classes through the forked cast pipeline — tank (knight), healer
// (cleric), melee (warrior), caster (pyromancer). Each class casts every skill on its bar, in order,
// into a pack of hounds, with the monsters, the skill clocks, the placed objects, walls, pools and
// delayed strikes all running. Farhold's side is its real skill bar + real skill runtime + real
// EnemyField + main.js castSkill transcribed (farhold-oracle-skills.mjs), under mock timers.
// Before every skill both sides make a basic attack (a melee skill borrows that swing's shape).
// Every frame: the same health on every hound, the same statuses, the same player health, mana and
// barrier, the same cooldowns — and the rngs in step at the end.
//
// What is NOT compared (and why): who a monster is aiming at — Farhold's single-player aim and
// Thousandvale's threat table are designed to differ; both pick the one player here. Summons and
// forms are not in these classes' fixtures (followers are M2) — Guardian Light is cast but summons
// nothing on either side.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as O from './farhold-oracle.mjs';
import { farholdSkills } from './farhold-oracle-skills.mjs';
import { parityEngineFor as engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

const DT = 0.05;

async function pair({ classId, level, seed, pack }) {
  const F = O.farholdRpg(seed);
  const fp = O.farholdCharacter(F, classId, level, O.makeRng(seed + 1));
  const ff = O.farholdField(F, seed);
  ff.oraclePlayer = fp;
  const fmobs = pack.map(([id, lvl, x, z]) => O.farholdAdd(ff, F.enemies.enemies.find(d => d.id === id), lvl, x, z));
  const control = { x: 0, z: 0, yaw: 0 };
  const fs = farholdSkills(F, ff, fp, control, O.makeRng(seed + 2));

  const engine = await engineFor(seed);
  const room = roomFor(engine, { rng: makeRng(seed) });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  const tp = createCharacter(engine, { id: 'p1', classId, level, rng: makeRng(seed + 1) });
  tp.roomRng = makeRng(seed + 2);
  room.field.add(tp, 'player');
  const tmobs = pack.map(([id, lvl, x, z], i) => spawnMonster(room.field, engine.enemyDef(id), lvl, x, z, { id: `m${i}` }));
  // big health so the fight lasts the whole bar on both sides
  for (const m of [...fmobs, ...tmobs]) { m.hp = m.maxHp = m.maxHp * 40; m.dmg = [1, 2]; }   // and a bite the player survives the whole bar
  return { F, fp, ff, fmobs, fs, control, room, tp, tmobs };
}

/** one frame on both sides, in main.js's order: timers, field, skill bar, skill runtime, pools */
function frame(s) {
  mock.timers.tick(DT * 1000);
  s.ff.update(DT, s.control, s.fp, { onEnemyStrike: e => O.farholdEnemyStrike(s.F, s.ff, s.fp, e, s.fs.mech, null, s.fs.uniqueEnv) });
  s.fs.tick(DT);
  s.room.run(() => { s.room.clock.advance(DT); s.room.combat.tick(DT); });
}

const keys = u => Object.keys(u.statuses || {}).sort().join(',');
function compare(s, at) {
  for (let i = 0; i < s.fmobs.length; i++) {
    const f = s.fmobs[i], t = s.tmobs[i];
    assert.equal(t.hp, f.hp, `${at}: hound ${i} hp`);
    assert.equal(keys(t), keys(f), `${at}: hound ${i} statuses`);
    assert.ok(Math.abs(t.x - f.x) < 1e-6 && Math.abs(t.z - f.z) < 1e-6, `${at}: hound ${i} position`);
  }
  assert.equal(Math.round(s.tp.hp), Math.round(s.fp.hp), `${at}: player hp`);
  assert.equal(Math.round(s.tp.mp), Math.round(s.fp.mp), `${at}: player mana`);
  assert.equal(s.tp.barrier || 0, s.fp.barrier || 0, `${at}: player barrier`);
  assert.equal(keys(s.tp), keys(s.fp), `${at}: player statuses`);
  s.tp.skills.slots.forEach((sl, i) => assert.ok(Math.abs(sl.ready - s.fs.bar.slots[i].ready) < 1e-9, `${at}: slot ${i} cooldown`));
}

const CLASSES = [
  { classId: 'knight', role: 'tank' },
  { classId: 'cleric', role: 'healer' },
  { classId: 'warrior', role: 'melee' },
  { classId: 'pyromancer', role: 'caster' },
];

for (const { classId, role } of CLASSES) {
  for (const seed of [4, 17]) {
    test(`${role} (${classId}), seed ${seed}: every skill on the bar lands the same in Farhold and Thousandvale`, async () => {
      mock.timers.enable({ apis: ['setTimeout'], now: 0 });
      try {
        const pack = [['moor_hound', 24, 0.5, 3.5], ['moor_hound', 24, -1.6, 4.4], ['moor_hound', 24, 1.9, 5.2], ['barrow_hound', 24, 0, 8]];
        const s = await pair({ classId, level: 30, seed, pack });
        const aim = { x: 0, z: 5 };
        let hurt = 0;
        for (let slot = 0; slot < 6; slot++) {
          const id = s.tp.skills.slots[slot].id;
          // aim and face the pack on both sides; keep both standing at the origin
          s.control.yaw = 0; s.tp.yaw = 0;
          s.fp.mp = s.fp.maxMp; s.tp.mp = s.tp.maxMp;
          // a basic attack first, on both sides: a melee skill borrows the last swing's shape
          if (s.tp.equipment.weapon && /staff/.test(s.tp.equipment.weapon.subtype || '')) {
            s.fs.rangedAttack(0);
            s.tp.swing.mainReady = 0;
            s.room.run(() => s.room.combat.attack(s.tp, { held: 0 }));
          } else {
            O.farholdSwing(s.F, s.ff, s.control, s.fp, 'main', slot, s.fs.uniqueEnv);
            s.room.run(() => s.room.combat.resolveSwing(s.tp, 'main', slot, s.tp.equipment.weapon));
          }
          compare(s, `${id} after the basic attack`);
          const before = s.fmobs.reduce((n, m) => n + m.hp, 0);
          const a = s.fs.cast(slot, aim);
          const b = s.room.run(() => s.room.combat.cast(s.tp, slot, { aim }));
          assert.equal(b.ok, a.ok !== false, `${id}: both sides agree it could be cast (${b.why || ''})`);
          for (let k = 0; k < 50; k++) { frame(s); compare(s, `${id} +${k}`); }
          hurt += before - s.fmobs.reduce((n, m) => n + m.hp, 0);
          // walk both back to the origin (a dash moved them) the same way
          s.control.teleport(0, 0); s.tp.x = 0; s.tp.z = 0;
        }
        assert.ok(hurt > 0 || classId === 'cleric', `${classId}'s bar did damage`);
        assert.equal(s.room.rng(), s.ff.rng(), 'the fight rngs are in step');
        assert.equal(s.tp.roomRng(), s.F.rpg.rng(), 'the skill-bar rngs are in step');
      } finally {
        mock.timers.reset();
      }
    });
  }
}
