// node --test prototypes/thousandvale/tests/C/dagger.test.mjs
//
// Round 11 Z62 (found by stream C, owner's decision 2026-10-15): Farhold's dagger back-stab measured the target's back
// the wrong way round — x2.2 and a bleed landed when the target FACED you and never from behind. Thousandvale's rule
// (data/rules/combat.json `dagger`, js/rules/combat-cfg.js, js/rules/field.js strike): every dagger hit gets the edge;
// a hit from behind gets the back-stab on top and the bleed. Solo damage stays where it was; the card says when.
// A parity engine (no combat.json) keeps Farhold's rule — tests/C/parity-attack.test.mjs holds that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';
import { abilityRows } from '../../js/rules/estimate.js';
import { basicCard, stampCaster } from '../../js/rules/caster-forms.js';
import { isBehind, daggerText } from '../../js/rules/combat-cfg.js';

/** One main-hand dagger stab from (0,0) facing +z at a monster 1.6 m ahead, which looks `facing`. */
async function stab({ facing, dagger = undefined, classId = 'shadow_dancer', level = 20 }) {
  const engine = await engineFor(7);
  if (dagger !== undefined) engine.combatCfg.dagger = dagger;
  const room = roomFor(engine, { rng: makeRng(7) });
  const me = createCharacter(engine, { id: 'p1', classId, level, rng: makeRng(3) });
  me.roomRng = room.rng;
  room.field.add(me, 'player');
  const mob = spawnMonster(room.field, engine.enemyDef('moor_hound'), level, 0, 1.6, { id: 'm0' });
  mob.maxHp = mob.hp = 1e9; mob.armor = 0; mob.facing = facing;
  me.derived.damage = [1000, 1000];             // a big flat hit, so the ratios are not lost to rounding
  me.x = 0; me.z = 0; me.yaw = 0;
  const w = me.equipment.weapon;
  const hits = room.run(() => room.combat.resolveSwing(me, 'main', 0, w));
  assert.ok(hits.length === 1 && hits[0].result.amount > 0, 'the stab landed');
  return { engine, amount: hits[0].result.amount, bleeding: !!mob.statuses?.bleed };
}

const FRONT = Math.PI;          // the monster at (0, 1.6) looks back at the attacker at the origin
const BACK = 0;                 // …or away from it, toward +z: the attacker is at its back

test('Z62: a dagger stab from BEHIND gets the back-stab on top of the edge and makes the target bleed; from the front, the edge only and no bleed', async () => {
  const front = await stab({ facing: FRONT });
  const back = await stab({ facing: BACK });
  const R = front.engine.combatCfg.dagger;
  assert.ok(Math.abs(back.amount / front.amount - (1 + R.backstabPct / 100)) < 0.03, `behind ${back.amount} vs front ${front.amount}`);
  assert.equal(back.bleeding, true, 'from behind: it bleeds');
  assert.equal(front.bleeding, false, 'from the front: no bleed');
  // the edge is on every hit, front included: the same stab with no edge deals 1 / (1 + edge) of it
  const bare = await stab({ facing: FRONT, dagger: { ...R, edgePct: 0 } });
  assert.ok(Math.abs(front.amount / bare.amount - (1 + R.edgePct / 100)) < 0.03, `front ${front.amount} vs no edge ${bare.amount}`);
  // side-on (90 degrees off its facing) is not behind: the back is the wedge past backDeg
  const side = await stab({ facing: FRONT - Math.PI / 2 });
  assert.ok(Math.abs(side.amount - front.amount) <= 1 && !side.bleeding, 'side-on counts as the front');
});

test('Z62: "behind" is the same test a skill\'s from-behind bonus uses — the wedge past backDeg, a skill that counts as from behind, a mark', () => {
  const me = { x: 0, z: 0 };
  assert.equal(isBehind(me, { x: 0, z: 2, facing: 0 }), true, 'it looks away: behind');
  assert.equal(isBehind(me, { x: 0, z: 2, facing: Math.PI }), false, 'it looks at you: not behind');
  assert.equal(isBehind(me, { x: 0, z: 2, facing: Math.PI }, { deg: 100, rules: { behind: true } }), true, 'a skill that counts as from behind');
  assert.equal(isBehind(me, { x: 0, z: 2, facing: Math.PI, statuses: { m: { kind: 'tag', fromBehind: true } } }), true, 'a mark');
  assert.equal(isBehind(me, { x: 0, z: 2, facing: Math.PI / 2 - 0.1 }, { deg: 100 }), false, '80 degrees past side-on is not yet the back');
  assert.equal(isBehind(me, { x: 0, z: 2, facing: 0.5 }, { deg: 100 }), true, '29 degrees off straight away is the back');
});

test('Z62: the dagger band — each dagger class deals within 10% of what Farhold\'s front-facing rule gave it solo, at levels 5 / 10 / 20 / 30 (sheet estimator: the dummy faces you)', async () => {
  const engine = await engineFor(3);
  const rule = engine.combatCfg.dagger;
  const total = (cls, L) => { const r = abilityRows(engine, createCharacter(engine, { id: 'h', classId: cls, level: L, name: 'H' })); return r.reduce((n, x) => n + (x.dps || 0), 0); };
  for (const cls of ['rogue', 'shadow_dancer']) {
    for (const L of [5, 10, 20, 30]) {
      engine.combatCfg.dagger = null;               // Farhold's rule: x2.2 and a bleed from the front
      const was = total(cls, L);
      engine.combatCfg.dagger = rule;
      const now = total(cls, L);
      assert.ok(now >= was * 0.9 && now <= was * 1.1, `${cls} level ${L}: ${now.toFixed(1)} a second against ${was.toFixed(1)}`);
    }
  }
});

test('Z62: the dagger\'s card and the basic-attack card say exactly when the back-stab applies, from the numbers the fight reads', async () => {
  const engine = await engineFor(3);
  engine.combatCfg.dagger = { edgePct: 137, backstabPct: 41, backDeg: 110 };
  const me = createCharacter(engine, { id: 'h', classId: 'rogue', level: 5, name: 'H' });
  const desc = basicCard(engine, me).desc;
  assert.match(desc, /every hit deals 137% more damage/);
  assert.match(desc, /140° wedge at the target's back/);
  assert.match(desc, /deals 41% more on top and makes the target bleed/);
  const w = stampCaster(engine, { ...me.equipment.weapon });
  assert.equal(w.attackText, daggerText(engine.combatCfg.dagger), 'the item card carries the same sentence');
  const sword = createCharacter(engine, { id: 'w', classId: 'warrior', level: 5, name: 'W' });
  assert.doesNotMatch(basicCard(engine, sword).desc, /Dagger:/, 'a sword says nothing about it');
});
