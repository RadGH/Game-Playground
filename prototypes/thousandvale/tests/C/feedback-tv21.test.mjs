// node --test prototypes/thousandvale/tests/C/feedback-tv21.test.mjs
//
// Feedback batch read 2026-10-21 (live #93-#113, dev #81-#84).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';

function roomWith({ id = 'fb21' } = {}) {
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id, kind: 'wilds', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 1, name: 'T', cls: 'warrior', level: 6, xp: 0, gold: 0, room: id, x: sx, z: sz }, null);
  return { room, me, sx, sz, R: room.rules };
}
const steps = (room, n) => { for (let i = 0; i < n; i++) room.step(); };
const recall = { type: 'recall' };

test('#104: a monster far away or asleep with you as its target does not keep you "fighting"', () => {
  const { room, me, R, sx, sz } = roomWith();
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: sx + 4, z: sz });
  R.room.run(() => { m.r.unit.targetId = me.id; m.r.unit.state = 'chase'; });
  assert.equal(R.useItem(me, recall).why, 'combat', 'a hound beside you is a fight');
  R.room.run(() => { m.r.unit.x = sx + 400; m.r.unit.state = 'chase'; m.r.unit.targetId = me.id; });
  assert.notEqual(R.useItem(me, recall).why, 'combat', 'one 400 m away is not');
  R.room.run(() => { m.r.unit.x = sx + 4; m.r.unit.asleep = true; m.r.unit.targetId = me.id; });
  assert.notEqual(R.useItem(me, recall).why, 'combat', 'one asleep is not');
  steps(room, 1);
});

import { rulesEngine } from '../../js/rules/index.js';
import { makeRng } from '../../js/rules/rng.js';
import { familyText } from '../../js/rules/attributes.js';
import { readFileSync } from 'node:fs';

test('#103: two-handed polearms — glaive and bardiche drop beside the halberd, two-handed, with reach', () => {
  const eng = rulesEngine();
  for (const base of ['halberd', 'glaive', 'bardiche']) {
    const it = eng.makeItem({ base, rarity: 'rare', level: 14, rng: makeRng(3) });
    assert.ok(it && it.twoHanded, `${base} is two-handed`);
    assert.equal(it.subtype, 'polearm', base);
  }
  const pool = JSON.parse(readFileSync(new URL('../../data/rules/loot-pool.json', import.meta.url), 'utf8'));
  const ids = JSON.stringify(pool).match(/"polearm":\s*\{[^}]*\}/)[0];
  for (const id of ['halberd', 'glaive', 'bardiche']) assert.match(ids, new RegExp(id));
});

test('#112: a melee weapon\'s guard line reads "In your main hand: N% damage reduction"', () => {
  const eng = rulesEngine();
  const it = eng.makeItem({ base: 'glaive', rarity: 'normal', level: 10, rng: makeRng(2) });
  assert.match(familyText(eng, it), /In your main hand: \d+% damage reduction\./);
});

test('#113: every class card is about the real-time game — no turns or rounds, and every skill it names is the class\'s own', () => {
  const eng = rulesEngine();
  const classes = Array.isArray(eng.classes) ? eng.classes : eng.classes?.classes || [];
  assert.ok(classes.length >= 32, `${classes.length} classes`);
  const S = eng.skillData.skills;
  const allNames = new Set(Object.values(S).map(k => k?.name).filter(Boolean));
  for (const c of classes) {
    const text = `${c.role || ''} ${c.hook || ''}`;
    assert.doesNotMatch(text, /\bturns? (order|per round)|\b(per|each|a|this|next|\d+) rounds?\b|extra actions|initiative order/i, `${c.id}: ${text}`);
    const own = new Set((eng.skillData.classes[c.id] || []).map(id => S[id]?.name));
    for (const n of allNames) if (n.length > 5 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(c.hook || '') && !own.has(n)) assert.fail(`${c.id}'s card names "${n}", which is not one of its skills`);
  }
  const t = classes.find(c => c.id === 'tactician');
  assert.equal(t.role, 'Battlefield Commander');
});
