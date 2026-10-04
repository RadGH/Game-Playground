// node --test prototypes/thousandvale/tests/C/party.test.mjs
//
// The MMO half of the cast pipeline (PLAN §6.2), which has no Farhold counterpart to compare with:
// ally-targeted heals, threat from healing, a tank's link carrying a party member's damage, a group
// revive, Tab-targeted bolts, and a taunt that holds a pack off the healer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters, monsterStrike } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';
import { addThreat } from '../../js/rules/threat.js';

async function party() {
  const engine = await engineFor(6);
  const room = roomFor(engine, { seed: 6 });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  const mk = (id, classId, x, z) => {
    const p = createCharacter(engine, { id, classId, level: 40, rng: makeRng(id.length * 7), x, z });
    p.roomRng = room.streams.get('bars');
    p.partyId = 'P1';
    room.field.add(p, 'player');
    return p;
  };
  const knight = mk('knight', 'knight', 0, 0), cleric = mk('cleric', 'cleric', 0, -8), mage = mk('mage', 'pyromancer', 3, -6);
  const stranger = createCharacter(engine, { id: 'stranger', classId: 'cleric', level: 40, rng: makeRng(1), x: 1, z: -7 });
  stranger.roomRng = room.streams.get('bars');
  room.field.add(stranger, 'player');
  const step = (n = 1) => { for (let i = 0; i < n; i++) room.run(() => { room.clock.advance(0.05); room.combat.tick(0.05); }); };
  return { engine, room, knight, cleric, mage, stranger, step };
}

test('Mend aimed at the knight heals the knight, not the cleric; a stranger is out of reach of party heals', async () => {
  const { room, knight, cleric, stranger } = await party();
  knight.hp = Math.round(knight.maxHp * 0.3);
  cleric.hp = Math.round(cleric.maxHp * 0.5);
  const kBefore = knight.hp, cBefore = cleric.hp;
  const r = room.run(() => room.combat.cast(cleric, 0, { target: 'knight' }));
  assert.ok(r.ok, r.why);
  assert.equal(r.healTarget, 'knight');
  assert.ok(knight.hp > kBefore, 'the knight was healed');
  assert.equal(cleric.hp, cBefore, 'the cleric was not');
  // the same Mend aimed at someone outside the party falls back to the caster
  stranger.hp = 10;
  cleric.skills.slots[0].ready = 0; cleric.mp = cleric.maxMp;
  const r2 = room.run(() => room.combat.cast(cleric, 0, { target: 'stranger' }));
  assert.equal(r2.healTarget, 'cleric');
  assert.equal(stranger.hp, 10);
});

test('healing makes threat on what is already fighting the healed ally — and only that', async () => {
  const { engine, room, knight, cleric } = await party();
  const fighting = room.run(() => spawnMonster(room.field, engine.enemyDef('moor_hound'), 30, 1, 2));
  const idle = room.run(() => spawnMonster(room.field, engine.enemyDef('moor_hound'), 30, 60, 60));
  addThreat(fighting, knight, 100);
  knight.hp = Math.round(knight.maxHp * 0.2);
  room.run(() => room.combat.cast(cleric, 0, { target: 'knight' }));
  assert.ok(fighting.threat.get('cleric') > 0, 'the hound on the knight heard the heal');
  assert.ok(!idle.threat?.has('cleric'), 'the far hound did not');
});

test('Challenge holds the pack on the knight while the mage and the cleric hit it', async () => {
  const { engine, room, knight, mage, step } = await party();
  const pack = room.run(() => [0, 1, 2].map(i => spawnMonster(room.field, engine.enemyDef('moor_hound'), 35, -2 + i * 2, 3)));
  room.run(() => room.combat.cast(knight, 3, { aim: { x: 0, z: 3 } }));          // Challenge
  step(2);
  for (const m of pack) assert.equal(m.targetId, 'knight');
  // the mage throws two Firebolts at the middle hound by Tab target
  room.run(() => room.combat.cast(mage, 0, { target: pack[1].id }));
  step(30);
  assert.ok(pack[1].hp < pack[1].maxHp, 'the Tab-targeted bolt landed on the middle hound');
  assert.equal(pack[1].targetId, 'knight', 'the taunt lifted the knight far enough that one bolt does not pull it');
});

test('Sworn Ward links the knight to the cleric: a bite on the cleric is carried by the knight', async () => {
  const { engine, room, knight, cleric } = await party();
  cleric.x = 2; cleric.z = 0;
  const r = room.run(() => room.combat.cast(knight, 2, { target: 'cleric' }));   // Sworn Ward
  assert.ok(r.ok, r.why);
  const hound = room.run(() => spawnMonster(room.field, engine.enemyDef('barrow_hound'), 40, 3, 1));
  hound.dmg = [cleric.maxHp, cleric.maxHp];
  const kBefore = knight.hp;
  room.run(() => monsterStrike(room.field, hound, cleric));
  assert.ok(!cleric.dead && cleric.hp > 0, 'the ward kept the cleric up');
  assert.ok(knight.hp < kBefore, 'the knight took the share');
});

test('Raise the Fallen stands a dead party member back up at half health; a stranger stays down', async () => {
  const { room, knight, cleric, stranger } = await party();
  for (const u of [knight, stranger]) { u.dead = true; u.hp = 0; u.x = 1; u.z = -6; }
  const r = room.run(() => room.combat.cast(cleric, 4, {}));
  assert.ok(r.ok, r.why);
  assert.ok(!knight.dead && knight.hp >= Math.round(knight.maxHp * 0.5) - 1);
  assert.ok(stranger.dead);
});
