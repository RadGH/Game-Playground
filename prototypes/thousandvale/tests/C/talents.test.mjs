// node --test prototypes/thousandvale/tests/C/talents.test.mjs
//
// Play-test 1 P6 — per-skill TALENT TREES (js/rules/talents.js, data/rules/talents.json):
//   * every node of every one of the 180 trees changes HOW the skill works — none is only a number
//     ("+35% damage", "the width becomes 4 m"), and none is a library rule that does nothing on that
//     skill's shape in Thousandvale;
//   * every node picked on its own actually changes the plan the skill casts, and casting it in a fight
//     throws nothing;
//   * every card is written from the node's numbers (no "undefined", no "No change.");
//   * the pick / Unbinder API the room uses: level gates, one pick a tier, empty a tier, save and load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { isPlainNode, libWorks, tierNodes, nodeText, TIER_LEVELS } from '../../js/rules/talents.js';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../../data/rules/talents.json', import.meta.url), 'utf8'));
const engine = rulesEngine();
const rows = engine.skillData.skills;

test('every node of every tree changes how the skill works — no plain numbers, nothing inert on its shape', () => {
  let nodes = 0;
  const plain = [], inert = [], thin = [], dup = [];
  for (const [id, row] of Object.entries(rows)) {
    const seen = new Set();
    for (const tier of [1, 2, 3, 4]) {
      const list = tierNodes(row, tier);
      if (list.length < 2) thin.push(`${id}:${tier}`);
      for (const nd of list) {
        nodes++;
        if (seen.has(nd.id)) dup.push(`${id}:${nd.id}`);
        seen.add(nd.id);
        if (isPlainNode(nd, policy.plainLibs)) plain.push(`${id}:${tier}:${nd.id}`);
        if (!nd.bespoke && !libWorks(nd.id, row, policy.libShapes)) inert.push(`${id}:${tier}:${nd.id}`);
      }
    }
  }
  assert.equal(Object.keys(rows).length, 180);
  assert.deepEqual(plain, [], 'nodes that are only a number');
  assert.deepEqual(inert, [], 'library nodes that do nothing on this skill');
  assert.deepEqual(thin, [], 'every tier offers a choice of at least two');
  assert.deepEqual(dup, []);
  assert.ok(nodes >= 180 * 4 * 2, `${nodes} nodes`);
  assert.equal(engine.talentReport.replaced, Object.keys(policy.replace).length, 'every replacement found its node');
});

test('the classifier itself: a percentage or a bigger number is plain, a new behaviour is not', () => {
  assert.ok(isPlainNode({ bespoke: true, mod: { mul: { mult: 1.3 } } }));
  assert.ok(isPlainNode({ bespoke: true, mod: { set: { width: 4 }, mul: { mult: 0.8 } } }));
  assert.ok(isPlainNode({ bespoke: true, mod: { set: { 'form.stats.armorPct': 0.25 } } }));
  assert.ok(isPlainNode({ id: 'heavy', mod: { mult: 1.35 } }, policy.plainLibs));
  assert.ok(!isPlainNode({ bespoke: true, mod: { again: { delay: 1 } } }));
  assert.ok(!isPlainNode({ bespoke: true, mod: { set: { shape: 'around' } } }));
  assert.ok(!isPlainNode({ bespoke: true, mod: { set: { 'form.onEnter': { shape: 'self' } } } }));
  assert.ok(!isPlainNode({ id: 'chain', mod: { chains: 2 } }, policy.plainLibs));
});

test('every card is written from its numbers', () => {
  const bad = [];
  for (const [id, row] of Object.entries(rows)) for (const tier of [1, 2, 3, 4]) for (const nd of tierNodes(row, tier)) {
    const t = nodeText(nd, row, engine.statuses, rows);
    if (!t || /undefined|NaN|No change|changes\.$/.test(t)) bad.push(`${id}:${nd.id}: ${t}`);
  }
  assert.deepEqual(bad, []);
});

/** A room with one character of `cls` at `level` and a target dummy pack. */
function setup(cls = 'pyromancer', level = 30) {
  const terrain = standInTerrain(2, 2048);
  const barCalls = [];
  const room = createRoom({ id: 'tal', terrain, seed: 3, camps: [], createRules, hooks: { log: () => {} } });
  room.host.barChanged = e => barCalls.push(e.id);
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 5, name: 'T', cls, level, xp: 0, gold: 0, room: 'tal', x: sx, z: sz }, null);
  return { room, me, R: room.rules, sx, sz, barCalls };
}

test('every node picked on its own changes the plan its skill casts (all 30 classes)', () => {
  const unchanged = [];
  let checked = 0;
  for (const cls of engine.classes.map(c => c.id)) {
    const { me, R } = setup(cls, 30);
    const u = me.r.unit;
    u.skills.slots.forEach((sl, i) => {
      if (sl.empty) return;
      const bare = JSON.stringify(R.room.run(() => u.skills.rowFor(i)));
      for (const tier of [1, 2, 3, 4]) for (const nd of tierNodes(rows[sl.id], tier)) {
        u.skillTalents = { [sl.id]: { [tier]: nd.id } };
        const picked = JSON.stringify(R.room.run(() => u.skills.rowFor(i)));
        checked++;
        if (picked === bare) unchanged.push(`${cls}/${sl.id}:${tier}:${nd.id}`);
      }
      u.skillTalents = {};
    });
  }
  assert.ok(checked > 1400, `${checked} nodes checked`);
  assert.deepEqual(unchanged, [], 'a node that leaves the skill exactly as it was');
});

test('casting a talented skill in a fight throws nothing (every node of 6 classes, one at a time)', () => {
  for (const cls of ['warrior', 'pyromancer', 'cleric', 'warlock', 'druid', 'bard']) {
    const { room, me, R, sx, sz } = setup(cls, 30);
    const u = me.r.unit;
    for (let i = 0; i < 6; i++) {
      const sl = u.skills.slots[i];
      if (sl.empty) continue;
      for (const tier of [1, 2, 3, 4]) for (const nd of tierNodes(rows[sl.id], tier)) {
        const m = room.spawn({ kind: 'monster', type: 'wolf', level: 30, x: sx + 3, z: sz + 3 });
        u.skillTalents = { [sl.id]: { [tier]: nd.id } };
        sl.ready = 0; sl.charges = null; u.mp = u.maxMp; u.hp = u.maxHp;
        room.intent(me, { t: 'cast', slot: i + 1, target: m.id, aim: { x: m.x, z: m.z } });
        for (let k = 0; k < 4; k++) room.step();
        if (!m.removed) room.remove(m);
      }
      u.skillTalents = {};
    }
    assert.equal(room.stats.rulesErrors, 0, `${cls}: ${room.stats.lastRulesError}`);
  }
});

test('the pick API: tier levels, one pick a tier, the Unbinder empties a tier, the bar hears of it', () => {
  const { me, R, barCalls } = setup('warlock', 9);
  const view = R.talents(me);
  assert.deepEqual(view.tiers, TIER_LEVELS);
  const gd = view.skills.find(s => s.skillId === 'gnawing_dark');
  assert.ok(gd && gd.tiers.length === 4 && gd.tiers[0].nodes.length >= 2, 'the screen gets every tier and node');
  assert.equal(gd.tiers[2].open, false, 'tier 3 opens at 18');
  const t1 = gd.tiers[0].nodes[0].id, t1b = gd.tiers[0].nodes[1].id;
  const ok = R.pickTalent(me, 'gnawing_dark', 1, t1);
  assert.equal(ok.ok, true, ok.text);
  assert.ok(ok.bar.find(b => b.id === 'gnawing_dark').talents.length === 1, 'the bar carries the pick by name');
  assert.ok(ok.build.talents.gnawing_dark['1'] === t1);
  assert.ok(barCalls.includes(me.id), 'host.barChanged was called');
  const again = R.pickTalent(me, 'gnawing_dark', 1, t1b);
  assert.equal(again.ok, false);
  assert.match(again.text, /Unbinder/);
  const high = R.pickTalent(me, 'gnawing_dark', 3, gd.tiers[2].nodes[0].id);
  assert.equal(high.ok, false);
  assert.match(high.text, /level 18/);
  assert.equal(R.pickTalent(me, 'firebolt', 1, 'fan').ok, false, 'not on your bar');
  assert.equal(R.pickTalent(me, 'abyss_gate', 1, 'x').ok, false, 'a slot that is not open yet');
  assert.ok(R.retrainPrice(me, 'talent') > 0 && R.retrainPrice(me, 'talent', 'all') > R.retrainPrice(me, 'talent'));
  assert.equal(R.unpickTalent(me, 'gnawing_dark', 1).ok, true);
  assert.equal(R.pickTalent(me, 'gnawing_dark', 1, t1b).ok, true, 'an emptied tier takes a new pick');
  assert.equal(R.resetTalents(me).ok, true);
  assert.deepEqual(R.saveBuild(me).talents.gnawing_dark, {});
});

test('a saved build comes back on login; picks that no longer exist are dropped', () => {
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id: 'tal2', terrain, seed: 3, camps: [], createRules, hooks: { log: () => {} } });
  const build = { v: 1, talents: { gnawing_dark: { 1: 'splatter', 2: 'no_such_node' }, firebolt: { 1: 'fan' } }, perks: [], unlocks: {} };
  const me = room.addPlayer({ id: 6, name: 'L', cls: 'warlock', level: 12, room: 'tal2', x: terrain.spawn.x, z: terrain.spawn.z, build }, null);
  assert.deepEqual(room.rules.saveBuild(me).talents, { gnawing_dark: { 1: 'splatter' } });
});
