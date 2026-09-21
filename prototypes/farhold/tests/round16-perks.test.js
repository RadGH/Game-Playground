// Farhold — round 16: the perk forest grew four corner arms.
//
//   "Also add 4 more corner-facing quadrants to the Perks tree and have one specialize further in
//    bonus loot, one that specializes in defense, and two others your pick for whatever is lacking
//    (avoiding building mechanics, perks are RPG mode features)."
//
// Four arms became eight, which broke three things at once that a browser would not have shown us
// until somebody clicked the wrong dot:
//
//   1. `ARM_SECTOR` was the hard-coded `Math.PI / 2` — a quarter of the circle each, for four arms.
//      With eight arms every ring would have laid its nodes across a quarter it no longer owned and
//      every arm would have overlapped both of its neighbours.
//   2. The eight oddballs were pinned to the four diagonals, which is exactly where the four new
//      arms went. The fix from the LAST time this happened became the bug this time.
//   3. Eight arms of three nodes on a ring of radius 1 is 24 dots on a circle 6.3 units around —
//      closer together than a dot is wide.
//
// So the test that matters here is a geometric one: compute every node's real x/y and assert a
// minimum gap. That single assertion covers all three, and it fails loudly if anybody ever types an
// angle into this file again.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ARMS, ODDBALLS, TALENT_NODES, KEYSTONES, RINGS, NODE_KINDS,
  buildForest, ringStep, pointsFor, canTake, allocate, perkBonuses,
} from '../js/perks.js';

const here = dirname(fileURLToPath(import.meta.url));
const forest = buildForest();

/** Every node that costs a point — the hub is free and always taken. */
const buyable = forest.nodes.filter(n => n.id !== 'start');

/** The closest any two nodes get, in world units, and which two they are. */
function tightest(nodes) {
  let worst = Infinity, pair = '';
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < worst) { worst = d; pair = `${nodes[i].id} / ${nodes[j].id}`; }
    }
  }
  return { worst, pair };
}

/** The smallest angle between two headings, either way round the circle. */
function angleBetween(a, b) {
  return Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
}

// ---------------------------------------------------------------- 1. eight arms, four of them new

test('there are eight arms, one per corner and compass point, and no two look alike', () => {
  assert.equal(ARMS.length, 8, 'the tree should have eight arms after round 16');

  // the four originals are untouched — a save holds `melee:7:0`, so an arm key is a promise
  for (const key of ['melee', 'ranged', 'arcane', 'wild']) {
    assert.ok(ARMS.some(a => a.key === key), `the original ${key} arm has gone missing`);
  }
  // …and the four new ones are the ones that were asked for
  for (const key of ['guard', 'fortune', 'mend', 'rove']) {
    assert.ok(ARMS.some(a => a.key === key), `round 16's ${key} arm is not here`);
  }

  const keys = new Set(ARMS.map(a => a.key));
  assert.equal(keys.size, 8, 'two arms share a key, so their node ids would collide');

  const colours = new Set(ARMS.map(a => a.color.toLowerCase()));
  assert.equal(colours.size, 8, 'two arms are the same colour on the canvas and in the legend');

  // the eight arms are evenly spread: every one is a multiple of an eighth-turn from the next
  const angles = ARMS.map(a => Math.atan2(Math.sin(a.angle), Math.cos(a.angle))).sort((x, y) => x - y);
  for (let i = 1; i < angles.length; i++) {
    assert.ok(Math.abs((angles[i] - angles[i - 1]) - Math.PI / 4) < 1e-9,
      `arms ${i - 1} and ${i} are ${(angles[i] - angles[i - 1]).toFixed(3)} rad apart, not an eighth turn`);
  }

  for (const arm of ARMS) {
    assert.ok(arm.name && arm.blurb, `${arm.key} has no name or no blurb for the legend`);
    assert.equal(arm.minor.length, 6, `${arm.key} needs six minor stats to fill its rings`);
    assert.equal(arm.major.length, 5, `${arm.key} needs five major stats`);
    for (const [stat, value, desc] of [...arm.minor, ...arm.major]) {
      assert.ok(stat && desc, `${arm.key} has a nameless stat entry`);
      assert.ok(Number.isFinite(value) && value !== 0, `${arm.key}'s ${stat} grants ${value}`);
    }
  }
});

test('every arm ends in exactly one keystone and passes two talents', () => {
  for (const arm of ARMS) {
    const stones = KEYSTONES.filter(k => k.arm === arm.key);
    // `buildForest` does `KEYSTONES.find(...)` with no guard, so a missing one throws on load
    assert.equal(stones.length, 1, `${arm.key} has ${stones.length} keystones, and it must have one`);
    assert.ok(stones[0].desc && stones[0].cost, `${stones[0].id} is a gift with no cost`);

    const talents = TALENT_NODES.filter(t => t.arm === arm.key);
    assert.ok(talents.length >= 2, `${arm.key} has ${talents.length} talents; ring 5 wants two`);
    for (const t of talents) assert.ok(t.id && t.flag && t.desc, `${t.id} is incomplete`);
  }
  const ids = [...KEYSTONES.map(k => k.id), ...TALENT_NODES.map(t => t.id)];
  assert.equal(new Set(ids).size, ids.length, 'two talents or keystones share an id');

  // every keystone and talent names an arm that exists — the other direction of the same check
  const keys = new Set(ARMS.map(a => a.key));
  for (const k of KEYSTONES) assert.ok(keys.has(k.arm), `${k.id} sits on an arm that is not there`);
  for (const t of TALENT_NODES) assert.ok(keys.has(t.arm), `${t.id} sits on an arm that is not there`);
});

// ---------------------------------------------------------------- 2. the count

test('the forest is one hub, eight arms of twenty, and eight oddballs', () => {
  const perArm = RINGS.reduce((sum, r) => sum + r.per, 0);
  assert.equal(perArm, 20, 'an arm is twenty nodes; the rings no longer add up to that');
  assert.equal(forest.nodes.length, 1 + ARMS.length * perArm + ODDBALLS.length);
  assert.equal(forest.nodes.length, 169, 'the node count moved without the test being told');

  for (const arm of ARMS) {
    const mine = forest.nodes.filter(n => n.arm === arm.key);
    assert.equal(mine.length, perArm, `${arm.key} grew ${mine.length} nodes`);
    assert.equal(mine.filter(n => n.kind === 'keystone').length, 1);
    assert.equal(mine.filter(n => n.kind === 'talent').length, 2);
  }
  assert.equal(forest.nodes.filter(n => n.oddball).length, ODDBALLS.length);

  // ids are unique, and the ones a save might already hold are exactly where they were
  const ids = forest.nodes.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length, 'two nodes share an id, so a save would be ambiguous');
  assert.equal(forest.byId.get('melee:7:0')?.keystoneId, 'doubled_grasp');
  assert.equal(forest.byId.get('wild:7:0')?.keystoneId, 'the_pack');
  for (const n of forest.nodes) assert.ok(NODE_KINDS[n.kind] || n.kind === 'hub', `${n.id} is a ${n.kind}`);
});

// ---------------------------------------------------------------- 3. nothing sits on anything else

test('no two nodes are on top of each other — the sector fix and the oddball re-angle, in one line', () => {
  const { worst, pair } = tightest(forest.nodes);
  // With the old `ARM_SECTOR = Math.PI / 2` this lands at roughly 0.00 (a new corner arm laid
  // straight over an old one), and with the oddballs still on the diagonals it lands at 0.00 again.
  assert.ok(worst > 0.45, `${pair} are only ${worst.toFixed(3)} apart`);
});

test('an arm keeps its nodes inside its own slice of the circle', () => {
  // The real rule: half a slice either side of the centreline, with a hair of tolerance for the
  // ring where `ARM_SECTOR / per` is exactly what the step comes out as.
  const half = Math.PI / ARMS.length;
  for (const arm of ARMS) {
    for (const ring of RINGS) {
      const step = ringStep(ring.radius, ring.per);
      const reach = step * (ring.per - 1) / 2;
      assert.ok(reach <= half + 1e-9,
        `${arm.key} ring ${ring.at} reaches ${reach.toFixed(3)} rad, past its ${half.toFixed(3)} half-slice`);
    }
    for (const node of forest.nodes.filter(n => n.arm === arm.key)) {
      const off = angleBetween(Math.atan2(node.y, node.x), arm.angle);
      assert.ok(off <= half + 1e-9, `${node.id} is ${off.toFixed(3)} rad off its own arm`);
    }
  }
});

test('an oddball sits on a seam between two arms, and joins one arm on each side', () => {
  const odd = forest.nodes.filter(n => n.oddball);
  assert.ok(odd.length > 0);
  for (const node of odd) {
    const angle = Math.atan2(node.y, node.x);
    for (const arm of ARMS) {
      assert.ok(angleBetween(angle, arm.angle) > 0.3,
        `${node.id} is only ${angleBetween(angle, arm.angle).toFixed(2)} rad off the ${arm.key} arm`);
    }
    // it is between two rings as well as between two arms
    const r = Math.hypot(node.x, node.y);
    for (const ring of RINGS) {
      assert.ok(Math.abs(r - ring.radius) > 0.25, `${node.id} sits on ring ${ring.at}`);
    }
    // and the two nodes it hangs off belong to different arms, which is the whole point of it
    const joins = (forest.neighbours.get(node.id) || []).map(id => forest.byId.get(id));
    assert.equal(joins.length, 2, `${node.id} has ${joins.length} ways in`);
    assert.notEqual(joins[0].arm, joins[1].arm, `${node.id} hangs off one arm twice`);
  }
});

// ---------------------------------------------------------------- 4. every grant is a real stat

test('every stat a node grants is a field js/rpg.js actually computes', () => {
  // The whole reason `perks.js` can be a plain data table is that its stat keys ARE `derived` field
  // names, so `rpg.derive` folds them in with no translation. Which means a typo is not a crash —
  // it is a node that reads fine on screen and does nothing at all, forever.
  const rpg = readFileSync(join(here, '..', 'js', 'rpg.js'), 'utf8');
  const open = rpg.indexOf('const d = {');
  const close = rpg.indexOf('inert: []', open);
  assert.ok(open > 0 && close > open, 'could not find the derived-stat table in js/rpg.js');
  const table = rpg.slice(open, close);
  const known = new Set([...table.matchAll(/(\w+)\s*:/g)].map(m => m[1]));
  assert.ok(known.has('magicFind') && known.has('armor'), 'the derived table did not parse');

  const seen = new Set();
  for (const node of forest.nodes) {
    for (const [stat, value] of Object.entries(node.grants || {})) {
      seen.add(stat);
      assert.ok(known.has(stat), `${node.id} grants "${stat}", which js/rpg.js never computes`);
      assert.ok(Number.isFinite(value), `${node.id} grants ${value} of ${stat}`);
    }
  }
  // and the round-16 arms really do reach the stats they were added for
  for (const stat of ['magicFind', 'xpFind', 'scavengeChance', 'blockChance', 'barrier', 'hpOnKill', 'stealth', 'revealRange']) {
    assert.ok(seen.has(stat), `nothing in the forest grants ${stat}`);
  }
});

test('the new arms hand out what their blurb says they do', () => {
  const walkOut = key => {
    const player = { level: 99, perks: [] };
    for (let i = 0; i < 40; i++) {
      const next = forest.nodes.find(n => n.arm === key && canTake(player, forest, n.id).ok);
      if (!next) break;
      allocate(player, forest, next.id);
    }
    return perkBonuses(player, forest).stats;
  };
  const guard = walkOut('guard');
  assert.ok(guard.armor > 0 && guard.maxHp > 0, 'the defence arm gave no defence');
  const fortune = walkOut('fortune');
  assert.ok(fortune.magicFind > 0 && fortune.xpFind > 0, 'the loot arm gave no loot');
  const mend = walkOut('mend');
  assert.ok((mend.hpRegen > 0 || mend.lifeSteal > 0) && mend.hpOnKill > 0, 'the recovery arm gave no recovery');
  const rove = walkOut('rove');
  assert.ok(rove.movePct > 0 && rove.stealth > 0, 'the mobility arm gave no mobility');
});

// ---------------------------------------------------------------- 5. you can walk to all of it

test('every node can be reached from the hub by walking the links', () => {
  const seen = new Set(['start']);
  const queue = ['start'];
  while (queue.length) {
    const at = queue.pop();
    for (const next of forest.neighbours.get(at) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  const stranded = forest.nodes.filter(n => !seen.has(n.id)).map(n => n.id);
  assert.deepEqual(stranded, [], `${stranded.length} nodes have no way in: ${stranded.slice(0, 5).join(', ')}`);

  // both halves of the graph agree — the canvas draws `links`, `canTake` reads `neighbours`
  for (const [a, b] of forest.links) {
    assert.ok((forest.neighbours.get(a) || []).includes(b), `${a} -> ${b} is drawn but not walkable`);
    assert.ok((forest.neighbours.get(b) || []).includes(a), `${b} -> ${a} is drawn but not walkable`);
  }
});

// ---------------------------------------------------------------- 6. the points still mean something

test('a level-50 character walks a long way and is nowhere near finished', () => {
  const points = pointsFor(50);
  assert.equal(points, 58);
  assert.ok(points > 40, 'fifty levels should buy a real build');
  assert.ok(points < buyable.length / 2,
    `${points} points out of ${buyable.length} nodes — the tree is no longer a choice`);

  // greedily walk whatever is reachable and check it is a build, not the whole tree
  const player = { level: 50, perks: [] };
  let spent = 0;
  while (spent < points) {
    const next = forest.nodes.find(n => canTake(player, forest, n.id).ok);
    if (!next) break;
    allocate(player, forest, next.id);
    spent++;
  }
  assert.equal(spent, points, 'ran out of reachable nodes before running out of points');
  const { keystones } = perkBonuses(player, forest);
  assert.ok(keystones.length < KEYSTONES.length, 'fifty levels collected every keystone in the game');

  // …and the far side of the tree is still shut: eight arms out, 58 points cannot reach them all
  const far = forest.nodes.filter(n => n.kind === 'keystone' && !player.perks.includes(n.id));
  assert.ok(far.length >= 4, 'more than half the keystones were reachable in one walk');
});
