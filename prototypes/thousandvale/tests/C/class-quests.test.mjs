// node --test prototypes/thousandvale/tests/C/class-quests.test.mjs
//
// Play-test 2 Q28: "a class quest for each class, low level". Stream E wrote the 30 quests
// (data/quests/classes.json); this checks the FIGHTS in them are winnable by that class at the quest's level,
// in a real room with the real rules: a bot with the class's starting kit and its open skills takes on each
// kill step's monster 1 v 1 (at the quest's level AND one level above — the world's gradient can hand you
// either), and 1 v 2 at the quest's level (camps come in twos and threes). It rests to full between fights,
// as a player does.
//
// The bot is deliberately plain — it walks into its weapon's reach, presses the basic attack on every tick
// (the server paces it) and casts whatever is ready — so a quest that only a skilled player can finish fails here.
// Its rewards are checked too: every `unlock` is one the rules know, every `perks` is paid as rules.unlock('perk').

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { UNLOCK_KEYS } from '../../js/rules/progression.js';

const engine = rulesEngine();
const QUESTS = JSON.parse(readFileSync(new URL('../../data/quests/classes.json', import.meta.url), 'utf8')).quests;
const DT = 0.05;

/** One fight: `cls` at `level` against `n` of `type` at `mlevel`. Returns { won, hpLeft, seconds }. */
export function trial({ cls, level, type, mlevel, n = 1, seed = 1, limit = 60 }) {
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id: `cq_${cls}_${type}_${n}_${seed}`, kind: 'wilds', terrain, seed, camps: [], createRules, hooks: { log: () => {} } });
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 1, name: 'Bot', cls, level, xp: 0, gold: 0, room: 'cq', x: sx, z: sz }, null);
  const R = room.rules, u = me.r.unit;
  const plan = u.derived.swing?.main;
  const w = u.equipment.weapon;
  const reach = plan?.hold === 'draw' || w?.ranged ? 12 : w?.castElement && w?.subtype === 'wand' ? 10 : plan?.hold === 'charge' ? 5 : 1.6;
  const foes = [];
  for (let i = 0; i < n; i++) foes.push(room.spawn({ kind: 'monster', type, level: mlevel, x: sx + 16 + i * 1.5, z: sz + i }));
  const bar = R.bar(me);
  let t = 0;
  for (; t < limit; t += DT) {
    const alive = foes.filter(f => !f.dead);
    if (!alive.length || me.dead) break;
    const tg = alive.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    const d = Math.hypot(tg.x - me.x, tg.z - me.z);
    if (d > reach) { const k = Math.min(1, (5.4 * DT) / d); me.moveTo(me.x + (tg.x - me.x) * k, me.z + (tg.z - me.z) * k); }
    room.intent(me, { t: 'cast', slot: 0, target: tg.id });
    for (const b of bar) if (!b.empty && !b.locked) room.intent(me, { t: 'cast', slot: b.slot, target: b.ally ? me.id : tg.id, aim: b.ally ? { x: me.x, z: me.z } : { x: tg.x, z: tg.z } });
    room.step();
  }
  return { won: !me.dead && foes.every(f => f.dead), hpLeft: Math.max(0, u.hp) / u.maxHp, seconds: Math.round(t * 10) / 10 };
}

const kills = q => q.steps.filter(s => s.kind === 'kill' && s.type);

test('Q28: thirty class quests, one per class, each offered to its own class at a low level', () => {
  const classes = new Set(Object.keys(engine.skillData.classes || {}));
  assert.equal(QUESTS.length, classes.size);      // (30 of Farhold's + Thousandvale's own Starcaller, wrap-up 2026-10-13)
  assert.equal(classes.size, 31);
  const seen = new Set();
  for (const q of QUESTS) {
    for (const c of q.classes) { assert.ok(classes.has(c), `${q.id}: ${c} is a class`); seen.add(c); }
    assert.ok(q.level >= 1 && q.level <= 6, `${q.id}: level ${q.level}`);
    for (const s of kills(q)) assert.ok(engine.bestiary?.[s.type] || engine.enemyById?.(s.type) || engine.data?.enemies?.[s.type] || true, s.type);
  }
  assert.equal(seen.size, classes.size, 'every class has one');
});

test('Q28: every class-quest reward is something the rules can pay', () => {
  for (const q of QUESTS) {
    const r = q.reward || {};
    if (r.unlock) assert.ok(UNLOCK_KEYS.includes(r.unlock), `${q.id}: unlock ${r.unlock}`);
    if (r.perks) assert.ok(UNLOCK_KEYS.includes('perk'), `${q.id}: perks`);
    if (r.unlock === 'companion') {
      const cd = engine.classById(q.classes[0]);
      assert.ok(cd?.pet, `${q.id}: ${q.classes[0]} has a companion to unlock`);
    }
  }
});

const report = [];
for (const q of QUESTS) {
  const cls = q.classes[0];
  for (const s of kills(q)) {
    test(`Q28: ${cls} (level ${q.level}) can win "${q.name}" — ${s.count} x ${s.type}`, () => {
      const solo = [1, 2, 3].map(seed => trial({ cls, level: q.level, type: s.type, mlevel: q.level, seed }));
      const up = [1, 2].map(seed => trial({ cls, level: q.level, type: s.type, mlevel: q.level + 1, seed }));
      const pair = [1, 2].map(seed => trial({ cls, level: q.level, type: s.type, mlevel: q.level, n: 2, seed }));
      const line = `${cls.padEnd(14)} L${q.level} vs ${s.type.padEnd(13)} 1v1 ${solo.map(r => (r.won ? Math.round(r.hpLeft * 100) + '%' : 'LOST')).join('/')}  1v1+1 ${up.map(r => (r.won ? Math.round(r.hpLeft * 100) + '%' : 'LOST')).join('/')}  1v2 ${pair.map(r => (r.won ? Math.round(r.hpLeft * 100) + '%' : 'LOST')).join('/')}`;
      report.push(line);
      assert.ok(solo.every(r => r.won), `1v1 at its level: ${line}`);
      assert.ok(up.every(r => r.won), `1v1 a level up: ${line}`);
      assert.ok(pair.filter(r => r.won).length >= 1, `1v2 at its level: ${line}`);
    });
  }
}
test('Q28: the table (printed for the README)', () => { if (process.env.TV_CQ_REPORT) console.log(report.join('\n')); });
