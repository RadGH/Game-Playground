// node --test prototypes/thousandvale/tests/C/autoattack-target.test.mjs
//
// Owner, 2026-10-15 (a giant fen croaker and its small adds): "I want the auto attack to only attack your selected target,
// and if you are moving it should continue attacking your target. Right now if you face away, you still shoot, but you
// shoot directly forward instead of at the target … my auto attacks were hitting the smaller adds, even though I had the
// giant one selected. They weren't even in the way."
//
// Two faults, both on the server (js/rules/cast.js): the room copies your MOVEMENT facing onto you every tick, so a
// strike that resolved after its wind-up went the way you were running; and an arrow took the first body near its line
// and then splashed 2.6 m round where it landed, so the adds round a big target soaked the shots.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomWith } from './playtest2.test.mjs';
import { rulesEngine } from '../../js/rules/index.js';
import { makeRng } from '../../js/rules/rng.js';
import { attuneWeapon } from '../../js/rules/farhold.js';

const engine = rulesEngine();

/** A still, unkillable monster at (x, z). */
function dummy(room, x, z) {
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x, z });
  m.r.unit.maxHp = m.r.unit.hp = 99999; m.r.unit.speed = 0; m.r.unit.attackEvery = 999;
  return m;
}

/**
 * Auto-attack `target` for `secs` while RUNNING THE OTHER WAY (the movement facing points away from it every tick, as
 * the room's input does), the client's click every 250 ms. -> hits by victim id.
 */
function fightRunningAway({ base = null, cls, dist, adds }) {
  const { room, me, events, sx, sz, R } = roomWith({ cls, level: 6, id: 'aa' + (base || cls) });
  const u = me.r.unit;
  if (base) {
    const item = R.room.run(() => attuneWeapon(engine.rpg.loot.generate(base, 'normal', 'medium', { rng: makeRng(7) })));
    R.room.run(() => { engine.rpg.equip(u, item, { force: true }); engine.rpg.refresh(u); });
  }
  const target = dummy(room, sx + dist, sz);                 // due east
  const others = adds.map(([x, z]) => dummy(room, sx + x, sz + z));
  const pin = [[target, sx + dist, sz], ...others.map((m, i) => [m, sx + adds[i][0], sz + adds[i][1]])];
  const away = Math.atan2(-1, 0);                            // running due west
  for (let k = 0; k < 20 * 6; k++) {
    me.yaw = away;                                           // the movement facing, every tick
    if (k % 5 === 0) room.intent(me, { t: 'cast', slot: 0, target: target.id, aim: { x: target.x, z: target.z } });
    me.yaw = away;
    room.step();
    room.rules.room.run(() => { for (const [m, x, z] of pin) { m.r.unit.x = x; m.r.unit.z = z; } });
  }
  const hitsOn = m => events.filter(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.n > 0).length;
  return { onTarget: hitsOn(target), onAdds: others.map(hitsOn) };
}

for (const [base, cls, dist] of [['bow', 'ranger', 14], ['crossbow', 'demon_hunter', 14], ['javelin', 'ranger', 12]]) {
  test(`a ${base} on auto-attack while running away: every shot goes to the chosen target, none to the adds beside it or in the way you run`, () => {
    // two small adds at the big one's feet (1.5–2 m: inside the old 2.6 m splash) and one 6 m along your running line
    const r = fightRunningAway({ base, cls, dist, adds: [[dist, 1.5], [dist - 1.2, -1.5], [-6, 0]] });
    assert.ok(r.onTarget >= 3, `${base}: ${r.onTarget} hits on the chosen target`);
    assert.deepEqual(r.onAdds, [0, 0, 0], `${base}: hits on the adds ${r.onAdds}`);
  });
}

test('a wand on auto-attack while running away: the bolt flies at the chosen target, not straight ahead', () => {
  const r = fightRunningAway({ base: 'wand', cls: 'mage', dist: 12, adds: [[-6, 0], [-10, 0.5]] });
  assert.ok(r.onTarget >= 3, `${r.onTarget} hits on the chosen target`);
  assert.deepEqual(r.onAdds, [0, 0], `hits on the adds in front of you ${r.onAdds}`);
});

test('a sword on auto-attack, turned away mid-swing: the blow lands on the chosen target behind you, not the add ahead', () => {
  const r = fightRunningAway({ cls: 'warrior', dist: 1.6, adds: [[-1.6, 0]] });
  assert.ok(r.onTarget >= 3, `${r.onTarget} hits on the chosen target`);
  assert.deepEqual(r.onAdds, [0], `hits on the add ahead ${r.onAdds}`);
});
