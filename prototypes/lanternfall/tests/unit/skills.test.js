// Skill boards (docs/04 §7): data shape, needs, costs, one capstone, summed effects, generated text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from './helpers.js';
import { boardFor, canTake, take, untake, skillEffects, describeNode, branchPoints, nodeSummary } from '../../js/rpg/skills.js';
import { hasLongDecimal } from '../../../../shared/format.js';

const boards = loadJson('data/boards.json'), classes = loadJson('data/classes.json');
const hero = (cls = 'lamplighter', pts = 40) => ({ class: cls, skills: {}, unspent: { attr: 0, skill: pts } });

test('every class has a 12-node board: 3 branches × tiers 1-4, costs 1/2/3/4, capstones single-rank', () => {
  for (const c of classes.list) {
    const b = boardFor(boards, c.id); assert.ok(b, c.id); assert.equal(b.nodes.length, 12, c.id); assert.equal(b.branches.length, 3);
    for (let br = 0; br < 3; br++) for (let t = 1; t <= 4; t++) {
      const n = b.nodes.filter(x => x.branch === br && x.tier === t); assert.equal(n.length, 1, `${c.id} ${br}/${t}`);
      assert.equal(n[0].cost, t, n[0].id); if (t >= 3) assert.equal(n[0].ranks, 1, n[0].id);
    }
    assert.equal(new Set(b.nodes.map(n => n.id)).size, 12);
  }
});
test('tier 2 needs tier 1; tier 3 needs tier 2', () => {
  const h = hero(), b = boardFor(boards, 'lamplighter');
  assert.match(canTake(h, b, 'll_b3'), /Trimmed Wick/);
  assert.equal(take(h, b, 'll_b2'), null); assert.equal(h.unspent.skill, 39);
  assert.equal(canTake(h, b, 'll_b3'), null);
  assert.match(canTake(h, b, 'll_b4'), /Quick Braid/);
});
test('capstone needs tier 2 and 5 points in its branch (1 + 2×2 reaches it without tier 3)', () => {
  const h = hero(), b = boardFor(boards, 'lamplighter');
  take(h, b, 'll_b2'); take(h, b, 'll_b3');
  assert.match(canTake(h, b, 'll_a7'), /5 points spent in Wickcraft \(3 so far\)/);
  take(h, b, 'll_b3'); assert.equal(branchPoints(h, b, 0), 5);
  assert.equal(take(h, b, 'll_a7'), null); assert.equal(h.skills.ll_a7, 1);
});
test('one capstone at a time', () => {
  const h = hero(), b = boardFor(boards, 'lamplighter');
  for (const id of ['ll_b2', 'll_b3', 'll_b3', 'll_a7', 'll_c2', 'll_c3', 'll_c3']) assert.equal(take(h, b, id), null, id);
  assert.match(canTake(h, b, 'll_c7'), /You carry Lanternheart/);
});
test('points, max ranks and a closed board refuse with a reason', () => {
  const b = boardFor(boards, 'tinker'), h = hero('tinker', 1);
  assert.equal(canTake(h, b, 'tk_b2', { open: false }), 'The board opens in Act 2.');
  assert.equal(take(h, b, 'tk_b2'), null); assert.match(canTake(h, b, 'tk_b2'), /Needs 1 skill point \(you have 0\)/);
  h.unspent.skill = 10; take(h, b, 'tk_b2'); take(h, b, 'tk_b2'); assert.match(canTake(h, b, 'tk_b2'), /highest rank/);
  assert.equal(untake(h, b, 'tk_b2'), true); assert.equal(h.skills.tk_b2, 2);
});
test('skillEffects sums per rank and routes each kind', () => {
  const h = hero('lamplighter'), b = boardFor(boards, 'lamplighter');
  take(h, b, 'll_b2'); take(h, b, 'll_b2'); take(h, b, 'll_c2'); take(h, b, 'll_d2'); take(h, b, 'll_d4');
  const fx = skillEffects(h, b);
  assert.ok(Math.abs(fx.stats.oilCostPct + 0.08) < 1e-9); assert.equal(fx.stats.oil, 8);
  assert.ok(Math.abs(fx.moves.light.damagePct - 0.06) < 1e-9); assert.ok(fx.rules.ll_flare_crack);
  const s = hero('sluicewarden'), sb = boardFor(boards, 'sluicewarden'); take(s, sb, 'sw_b2');
  assert.deepEqual(skillEffects(s, sb).flameMult, { tide: 0.05, rime: 0.05 });
});
test('node text is generated from its numbers, has no stray braces and no long decimals', () => {
  for (const b of boards.boards) for (const n of b.nodes) for (let r = 1; r <= n.ranks; r++) {
    const t = describeNode(n, r); assert.ok(!/[{}]/.test(t), `${n.id}: ${t}`); assert.ok(!hasLongDecimal(t), `${n.id}: ${t}`); assert.ok(!/NaN|undefined/.test(t), `${n.id}: ${t}`);
  }
  const n = boardFor(boards, 'lamplighter').nodes.find(x => x.id === 'll_b2');
  assert.equal(describeNode(n, 1), 'wick oil cost −4%'); assert.equal(describeNode(n, 3), 'wick oil cost −12%');
  // move the number and the text follows (the text cannot lie)
  assert.equal(describeNode({ ...n, effect: { ...n.effect, value: -0.07 } }, 1), 'wick oil cost −7%');
  const s = nodeSummary(hero(), boardFor(boards, 'lamplighter'), n); assert.equal(s.now, null); assert.equal(s.next, 'wick oil cost −4%');
});
