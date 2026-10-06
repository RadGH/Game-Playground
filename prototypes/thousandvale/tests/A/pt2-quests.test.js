// Play-test 2 (stream A): the quest runtime for Q27 (everyone's starting chain: reach another town and beat a mini boss, in
// any order) and Q28 (a class quest per class). Pure quest book over the real province layout + an end-to-end auto grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestBook } from '../../js/sim/quests.js';
import { realContent, realServer, joinReal, rec, run } from './pt1-helpers.js';

const QUESTS = L => {
  const other = L.towns[1] || L.towns[0];
  return {
    npcs: { tester_elder: { name: 'Elder Test', role: 'elder', at: L.towns[0].name } },
    quests: [
      { id: 'start_road', name: 'The Long Road', level: 1, auto: true, autoComplete: true, order: 'any', next: 'start_report',
        steps: [{ kind: 'visit', town: other.name, text: 'Reach ' + other.name }, { kind: 'killOne', encounter: 'mb_rustjaw', text: 'Beat Rustjaw' }],
        reward: { xp: 0.5, gold: 2 } },
      { id: 'start_report', name: 'Report back', level: 2, giver: 'tester_elder', steps: [{ kind: 'talk', npc: 'tester_elder' }], reward: { xp: 0.2 } },
      { id: 'cls_ranger', name: 'A Ranger\'s Mark', level: 2, cls: 'ranger', giver: 'tester_elder', minLevel: 2, steps: [{ kind: 'kill', type: 'moor_hound', count: 2 }], reward: { xp: 0.3, unlock: 'companion' } },
      { id: 'cls_mage', name: 'A Mage\'s Mark', level: 2, cls: ['pyromancer', 'mage'], giver: 'tester_elder', steps: [{ kind: 'kill', type: 'moor_hound', count: 1 }] },
    ],
  };
};
async function book() {
  const C = await realContent();
  const L = C.layouts[0];
  const z = L.zones[0];
  return { L, b: createQuestBook({ layout: L, zones: [{ key: z.key, eid: 'pt2', sheet: z.sheet, quests: QUESTS(L), placements: [] }] }) };
}

test('Q27: an auto quest is given once; steps in any order; reaching a TOWN counts; it pays itself when done', async () => {
  const { L, b } = await book();
  const ch = { id: 1, cls: 'warrior', level: 1 };
  assert.deepEqual(b.grantAuto(ch), ['start_road']);
  assert.deepEqual(b.grantAuto(ch), [], 'not twice');
  let v = b.view(ch).active.find(q => q.id === 'start_road');
  assert.equal(v.order, 'any'); assert.ok(v.steps[0].at, 'the town step has a marker');
  // the mini boss first, then the town (the other way round from the list)
  assert.deepEqual(b.progress(ch, { kind: 'kill', encounter: 'mb_rustjaw', type: 'x' }), ['start_road']);
  v = b.view(ch).active.find(q => q.id === 'start_road');
  assert.equal(v.steps[1].done, true); assert.equal(v.steps[0].done, false); assert.equal(v.ready, false);
  assert.deepEqual(b.autoDone(ch), []);
  const other = L.towns[1] || L.towns[0];
  assert.ok(b.wantsPosition(ch), 'the town step still needs a position');
  b.progress(ch, { kind: 'visit', x: other.x + 1, z: other.z });
  assert.deepEqual(b.autoDone(ch), ['start_road']);
  const r = b.turnIn(ch, 'start_road', null);
  assert.ok(r.ok, 'pays with no giver'); assert.equal(r.next, 'start_report');
  assert.ok(b.offers(ch, { npcId: 'tester_elder', key: 'x' }).some(q => q.id === 'start_report'), 'the chain goes on');
});

test('Q28: a class quest is offered to its class only, and only from its level', async () => {
  const { b } = await book();
  const giver = { npcId: 'tester_elder', key: 'x' };
  const ranger1 = { id: 2, cls: 'ranger', level: 1 }, ranger2 = { id: 3, cls: 'ranger', level: 2 }, pyro = { id: 4, cls: 'pyromancer', level: 2 };
  assert.ok(!b.offers(ranger1, giver).some(q => q.id === 'cls_ranger'), 'not before its level');
  assert.ok(b.offers(ranger2, giver).some(q => q.id === 'cls_ranger'));
  assert.ok(!b.offers(ranger2, giver).some(q => q.id === 'cls_mage'), 'not another class\'s');
  assert.ok(b.offers(pyro, giver).some(q => q.id === 'cls_mage'), 'a list of classes works');
  assert.equal(b.accept(pyro, 'cls_ranger', giver).ok, false, 'cannot accept another class\'s quest');
});

test('Q27 end to end: a new character enters the world holding the auto quest', async () => {
  const C = await realContent();
  const L = C.layouts[0];
  const z = L.zones[0];
  z.quests = { ...(z.quests || {}), quests: [...((z.quests && z.quests.quests) || []), ...QUESTS(L).quests.slice(0, 1)] };
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Newcomer', 'warrior');
  assert.ok(a.joined.you.quests.active.some(q => q.id === 'start_road'), 'given on entering');
  assert.ok(rec(world, a).char.quests.active.start_road);
  // stream E's real starting chain (data/quests/start.json, included by test.json) and its 30 class quests are loaded
  assert.ok(a.joined.you.quests.active.some(q => q.id === 'start_two_good_legs'), 'E\'s starting quest is given');
  const book = world.P.values().next().value.book;
  assert.equal([...book.defs.values()].filter(d => d.classes || d.cls).length, 30, 'the 30 class quests');
  a.close(); await srv.stop();
  z.quests.quests = z.quests.quests.filter(q => q.id !== 'start_road');
  void run;
});
