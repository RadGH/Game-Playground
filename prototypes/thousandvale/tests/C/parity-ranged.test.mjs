// node --test prototypes/thousandvale/tests/C/parity-ranged.test.mjs
//
// PARITY FIXTURE for the basic attacks that are not a swing: a staff (tap and every charge
// length), a wand and a bow (drawn short and full). Farhold's side is main.js swingWith's staff /
// wand / bow branches transcribed in farhold-oracle-skills.mjs over the real EnemyField and the
// real weapon tables; Thousandvale's is js/rules/cast.js `attack(..., { held })`.
//
// Ground-plane note: Farhold aims a shot in 3D from the eye with the camera's pitch and lets an arrow
// fall under gravity; the server aims on the ground plane (PLAN §7: the client sends a ground aim).
// Both oracle and server here aim level at bodies on flat ground, where the two agree.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as O from './farhold-oracle.mjs';
import { farholdSkills } from './farhold-oracle-skills.mjs';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

const DT = 0.05;
async function pair(classId, seed) {
  const F = O.farholdRpg(seed);
  const fp = O.farholdCharacter(F, classId, 20, O.makeRng(seed + 1));
  const ff = O.farholdField(F, seed);
  ff.oraclePlayer = fp;
  const pack = [['moor_hound', 16, 0.3, 6], ['moor_hound', 16, -1.2, 7], ['moor_hound', 16, 1.4, 8.5], ['moor_hound', 16, 0, 3]];
  const fm = pack.map(([id, l, x, z]) => O.farholdAdd(ff, F.enemies.enemies.find(d => d.id === id), l, x, z));
  const control = { x: 0, z: 0, yaw: 0 };
  const fs = farholdSkills(F, ff, fp, control, O.makeRng(seed + 2));
  const engine = await engineFor(seed);
  const room = roomFor(engine, { rng: makeRng(seed) });
  const tp = createCharacter(engine, { id: 'p', classId, level: 20, rng: makeRng(seed + 1) });
  tp.roomRng = makeRng(seed + 2);
  room.field.add(tp, 'player');
  const tm = pack.map(([id, l, x, z], i) => spawnMonster(room.field, engine.enemyDef(id), l, x, z, { id: 'm' + i }));
  for (const m of [...fm, ...tm]) m.hp = m.maxHp = m.maxHp * 30;
  return { F, fp, ff, fm, fs, control, room, tp, tm };
}
// no monster thinking here: a basic attack's hits, statuses and pushes are what is compared
function frames(s, n) {
  for (let k = 0; k < n; k++) {
    mock.timers.tick(DT * 1000);
    s.fs.tick(DT);
    s.room.run(() => { s.room.clock.advance(DT); s.room.combat.tick(DT); });
  }
}
const keys = u => Object.keys(u.statuses || {}).sort().join(',');
function compare(s, at) {
  s.fm.forEach((f, i) => {
    assert.equal(s.tm[i].hp, f.hp, `${at}: hound ${i} hp`);
    assert.equal(keys(s.tm[i]), keys(f), `${at}: hound ${i} statuses`);
    assert.equal(!!s.tm[i].push, !!f.push, `${at}: hound ${i} pushed`);
  });
}

const CASES = [
  { classId: 'pyromancer', what: 'a staff', helds: [0, 0.2, 0.5, 0.9, 1.4, 2.2] },
  { classId: 'mage', what: 'an ice staff', helds: [0, 0.6, 1.8] },
  { classId: 'necromancer', what: 'a shadow staff', helds: [0, 0.7, 2] },
  { classId: 'stormcaller', what: 'a wand', helds: [0, 0, 0, 0] },
  { classId: 'ranger', what: 'a shortbow', helds: [0.3, 0.75, 1.2, 2.5] },
  { classId: 'demon_hunter', what: 'a crossbow', helds: [0, 0] },
];

for (const { classId, what, helds } of CASES) {
  test(`${what} (${classId}): every release lands the same in Farhold and Thousandvale`, async () => {
    mock.timers.enable({ apis: ['setTimeout'], now: 0 });
    try {
      for (const seed of [2, 9]) {
        const s = await pair(classId, seed);
        let dealt = 0;
        for (const held of helds) {
          const before = s.fm.reduce((n, m) => n + m.hp, 0);
          s.fp.mp = s.fp.maxMp; s.tp.mp = s.tp.maxMp;
          s.fs.rangedAttack(held);
          s.tp.swing.mainReady = 0; s.tp.swing.readySince = -10;      // the clock is tested elsewhere
          const r = s.room.run(() => s.room.combat.attack(s.tp, { held }));
          assert.ok(r.ok, `${classId} held ${held}: ${r.why}`);
          frames(s, 30);
          compare(s, `${classId} seed ${seed} held ${held}`);
          dealt += before - s.fm.reduce((n, m) => n + m.hp, 0);
        }
        assert.ok(dealt > 0, `${what} did damage`);
        assert.equal(s.room.rng(), s.ff.rng(), 'rngs in step');
      }
    } finally { mock.timers.reset(); }
  });
}

test('the server never believes a longer hold than the weapon has been ready for', async () => {
  const s = await pair('ranger', 3);
  const t = s.tp;
  s.room.run(() => { s.room.clock.advance(5); });
  assert.ok(s.room.run(() => s.room.combat.attack(t, { held: 1 })).ok, 'a full draw after standing ready');
  const again = s.room.run(() => s.room.combat.attack(t, { held: 2 }));
  assert.equal(again.ok, false, 'straight after a shot: still nocking');
  s.room.run(() => { s.room.clock.advance(0.2); });
  const short = s.room.run(() => s.room.combat.attack(t, { held: 3 }));
  assert.equal(short.ok, false, 'claiming a 3 s draw 0.08 s after the nock is refused (not drawn)');
  assert.equal(short.why, 'not drawn');
});
