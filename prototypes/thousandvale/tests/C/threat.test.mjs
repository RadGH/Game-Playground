// node --test prototypes/thousandvale/tests/C/threat.test.mjs
//
// The threat table (js/rules/threat.js) and the monster brain reading it: a tank holds, a healer's
// healing draws only what is already fighting, taunts force and stick, nobody ping-pongs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THREAT, addThreat, threatFromDamage, threatFromHeal, notice, taunt, forget, pickTarget, threatRows, clearThreat,
} from '../../js/rules/threat.js';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

const ent = (id, x = 0, z = 0, extra = {}) => ({ id, x, z, hp: 100, ...extra });
const world = list => { const m = new Map(list.map(e => [e.id, e])); return { lookup: id => m.get(id) || null, usable: e => e && e.hp > 0 && !e.dead }; };

test('damage adds threat scaled by the attacker\'s multiplier; the first to touch it is the target', () => {
  const m = { x: 0, z: 0, reach: 2.4 };
  const tank = ent('tank', 1, 0, { threatMult: 2 }), dps = ent('dps', 1, 1);
  threatFromDamage(m, dps, 10);
  assert.equal(m.targetId, 'dps');
  threatFromDamage(m, tank, 10);
  assert.deepEqual(threatRows(m).map(r => [r.id, r.threat]), [['tank', 20], ['dps', 10]]);
  const { lookup, usable } = world([tank, dps]);
  assert.equal(pickTarget(m, lookup, usable).id, 'tank', '20 beats 10 x 1.1');
});

test('no ping-pong: a challenger must pass 110% in melee reach, 130% out of it', () => {
  const m = { x: 0, z: 0, reach: 2.4 };
  const a = ent('a', 1, 0), close = ent('close', 1.5, 0), far = ent('far', 20, 0);
  const { lookup, usable } = world([a, close, far]);
  addThreat(m, a, 100);
  pickTarget(m, lookup, usable);
  addThreat(m, close, 105);
  assert.equal(pickTarget(m, lookup, usable).id, 'a', '105 < 110: stays');
  addThreat(m, close, 6);
  assert.equal(pickTarget(m, lookup, usable).id, 'close', '111 > 110: switches');
  addThreat(m, far, 140);
  assert.equal(pickTarget(m, lookup, usable).id, 'close', 'far needs 130% of 111 = 144.3');
  addThreat(m, far, 5);
  assert.equal(pickTarget(m, lookup, usable).id, 'far');
});

test('healing draws threat only from monsters already fighting the healed ally, split between them', () => {
  const healer = ent('healer'), tank = ent('tank');
  const m1 = { x: 0, z: 0 }, m2 = { x: 0, z: 0 }, idle = { x: 0, z: 0 };
  addThreat(m1, tank, 50); addThreat(m2, tank, 50);
  const n = threatFromHeal([m1, m2, idle], healer, tank, 40);
  assert.equal(n, 2);
  assert.equal(m1.threat.get('healer'), 40 * THREAT.HEAL_SHARE / 2);
  assert.equal(idle.threat, undefined, 'a monster not in the fight never hears the heal');
});

test('a taunt forces the target for its seconds and lifts the taunter above the top', () => {
  const m = { x: 0, z: 0, reach: 2.4 };
  const tank = ent('tank', 1, 0), dps = ent('dps', 1, 1);
  const { lookup, usable } = world([tank, dps]);
  addThreat(m, dps, 500);
  taunt(m, tank, 3);
  assert.equal(m.threat.get('tank'), 500 * THREAT.TAUNT_LIFT);
  assert.equal(pickTarget(m, lookup, usable, 1).id, 'tank');
  addThreat(m, dps, 400);                                        // dps now 900 vs tank 550
  assert.equal(pickTarget(m, lookup, usable, 1).id, 'tank', 'the taunt still holds');
  assert.equal(pickTarget(m, lookup, usable, 1.5).id, 'dps', 'and runs out');
});

test('dead or departed bodies drop off; clear wipes the table', () => {
  const m = { x: 0, z: 0, reach: 2.4 };
  const a = ent('a'), b = ent('b');
  const { lookup, usable } = world([a, b]);
  addThreat(m, a, 50); addThreat(m, b, 10);
  a.hp = 0;
  assert.equal(pickTarget(m, lookup, usable).id, 'b');
  forget(m, 'b');
  assert.equal(pickTarget(m, lookup, usable), null);
  notice(m, b);
  assert.equal(m.targetId, 'b');
  clearThreat(m);
  assert.equal(m.threat.size, 0);
});

test('in a room: two players, the hound goes for whoever hurt it most, and a tank stance holds it', async () => {
  const engine = await engineFor(2);
  const room = roomFor(engine, { seed: 2 });
  const tank = createCharacter(engine, { id: 'tank', classId: 'knight', level: 8, rng: makeRng(1), x: 0, z: 0 });
  const mage = createCharacter(engine, { id: 'mage', classId: 'pyromancer', level: 8, rng: makeRng(2), x: 0, z: -6 });
  for (const p of [tank, mage]) { p.roomRng = room.rng; room.field.add(p, 'player'); }
  const hound = room.run(() => spawnMonster(room.field, engine.enemyDef('moor_hound'), 6, 1.5, 1.5));
  room.run(() => {
    tickMonsters(room.field, 0.05);
    assert.equal(hound.state, 'chase');
    assert.equal(hound.targetId, 'tank', 'it noticed the nearer body first');
    threatFromDamage(hound, mage, 30);
    tickMonsters(room.field, 0.05);
    assert.equal(hound.targetId, 'mage', 'a big hit from range pulls it (30 > 1 x 1.3)');
    taunt(hound, tank, 4);
    tickMonsters(room.field, 0.05);
    assert.equal(hound.targetId, 'tank', 'the taunt brings it back');
  });
});
