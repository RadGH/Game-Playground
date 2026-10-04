// node --test prototypes/thousandvale/tests/C/room-rules.test.mjs
//
// The combat core inside stream A's REAL room (js/sim/room.js) through js/rules/index.js
// `createRules` (docs/protocol.md §7): entities get Farhold's numbers, a basic attack hits a wolf
// pack with Farhold's damage, the pack bites back, kills pay through `host.award`, refusals use the
// protocol codes, and nothing throws (the room counts rules errors in `stats.rulesErrors`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';

function setup({ cls = 'warrior', level = 3, wolves = 3 } = {}) {
  const terrain = standInTerrain(2, 2048);
  const events = [];
  const room = createRoom({ id: 'c-test', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const origEvent = room.host.event;
  room.host.event = ev => { events.push(ev); return origEvent(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const char = { id: 77, name: 'Tester', cls, level, xp: 0, gold: 0, room: 'c-test', x: sx, z: sz };
  const me = room.addPlayer(char, null);
  const pack = [];
  for (let i = 0; i < wolves; i++) pack.push(room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: sx + (i - 1) * 1.2, z: sz + 2.2 }));
  return { room, me, pack, events, char };
}

test('entities take Farhold\'s numbers: a level-3 warrior and moor hounds', () => {
  const { room, me, pack } = setup();
  const unit = me.r.unit;
  assert.ok(unit && unit.equipment.weapon, 'the player has a Farhold sheet with its class kit');
  assert.equal(me.hpMax, unit.maxHp);
  assert.equal(me.mpMax, unit.maxMp);
  for (const w of pack) {
    assert.equal(w.r.unit.defId, 'moor_hound', 'the camp type "wolf" is the bestiary\'s moor hound');
    assert.equal(w.hpMax, w.r.unit.maxHp);
  }
  assert.equal(room.stats.rulesErrors, 0);
});

test('a basic attack hits the pack, the pack bites back, a kill pays experience', () => {
  const { room, me, pack, events, char } = setup({ level: 2 });   // five levels over a kill pays nothing (Farhold's grey-con rule)
  const r0 = room.intent(me, { t: 'cast', slot: 0, target: pack[1].id });
  assert.deepEqual(r0, { ok: true });
  const again = room.intent(me, { t: 'cast', slot: 0, target: pack[1].id });
  assert.equal(again.ok, false);
  assert.equal(again.why, 'cooldown', 'the swing clock is enforced, with the protocol code');
  let swings = 1;
  for (let k = 0; k < 600 && pack.some(w => !w.dead); k++) {
    room.step();
    const alive = pack.filter(w => !w.dead);
    if (alive.length && k % 4 === 0) {
      const t = alive[0];
      if (room.intent(me, { t: 'cast', slot: 0, target: t.id }).ok) swings++;
    }
  }
  assert.ok(pack.every(w => w.dead), `the pack died (${swings} swings)`);
  const hits = events.filter(e => e.type === 'hit');
  assert.ok(hits.some(h => h.s === me.id && h.n > 0), 'the player hit something');
  assert.ok(hits.some(h => h.d === me.id && h.n > 0), 'something bit the player');
  assert.ok(events.some(e => e.type === 'aggro'), 'the hounds announced their target');
  assert.ok(char.xp > 0, 'kills paid experience through host.award');
  assert.ok(me.hp < me.hpMax || me.hp === me.hpMax, 'hp bar is a number');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('skills arrive on slots 1-6; an unlearned or locked slot refuses with a reason', () => {
  const { room, me, pack } = setup({ cls: 'knight', level: 30 });
  const res = room.intent(me, { t: 'cast', slot: 4, target: pack[0].id });   // Challenge: around + taunt
  assert.deepEqual(res, { ok: true });
  for (let k = 0; k < 3; k++) room.step();
  for (const w of pack) assert.equal(w.target, me.id, 'every hound in range now targets the knight');
  const low = setup({ cls: 'knight', level: 1 });
  const locked = low.room.intent(low.me, { t: 'cast', slot: 6 });
  assert.equal(locked.ok, false);
  assert.ok(locked.text, 'the refusal says why');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('death and respawn: a player killed by the pack is revived with full health and mana', () => {
  const { room, me, pack } = setup({ level: 1, wolves: 3 });
  for (const w of pack) { w.r.unit.dmg = [400, 400]; }
  for (let k = 0; k < 400 && !me.dead; k++) room.step();
  assert.ok(me.dead, 'the player went down');
  room.respawn(me);
  assert.ok(!me.dead);
  assert.equal(me.hp, me.hpMax);
  assert.equal(me.r.unit.hp, me.r.unit.maxHp);
  assert.ok(pack.every(w => !w.r.unit.threat?.has(me.id)), 'no hound remembers the dead player');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('levelFor / xpFor are Farhold\'s curve at the realm cap', () => {
  const { room } = setup();
  const rules = room.rules;
  assert.equal(rules.levelFor(0), 1);
  assert.ok(rules.xpFor(2) > 0);
  for (let l = 2; l <= 50; l++) assert.equal(rules.levelFor(rules.xpFor(l)), l, `level ${l}`);
});
