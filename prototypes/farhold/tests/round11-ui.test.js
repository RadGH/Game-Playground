// node --test prototypes/farhold/tests/round11-ui.test.js
//
// Four things the player reported about screens rather than about the world:
//
//   4.2  the perk tree drew lines that did not mean what they looked like
//   4.3  a perk could only be given back by giving back all of them
//   4.5  the Journal was a shop you took quests out of
//   4.11 the map had fifteen kinds of place on it and a key that named three
//
// The perk rules and the map's mark table are pure, so they are tested here rather than in a
// browser; the two screens that draw them are checked by eye in the report (and by round10.spec.js,
// which still clicks the forest).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildForest, allocate, canTake, linksOf, canRefund, refundOne, orphanedBy, refundAll,
  takenOf, spentBy, ODDBALLS,
} from '../js/perks.js';
import { MAP_MARKS, MARK_ORDER, markFor, drawMark } from '../js/map.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, f), 'utf8');
const hud = read('../js/hud.js');
const html = read('../index.html');
const css = read('../style.css');

const forest = buildForest();

// ---------------------------------------------------------------- 4.2 a line means an unlock

test('every drawn link is an unlock, and every unlock is a drawn link', () => {
  // The canvas draws `forest.links`; `canTake` reads `forest.neighbours`. If those two ever hold
  // different edges the screen is lying, which is exactly what the report was about — so they are
  // checked against each other rather than trusted to have come from the same loop.
  const fromLinks = new Set();
  for (const [a, b] of forest.links) {
    fromLinks.add(`${a}|${b}`);
    fromLinks.add(`${b}|${a}`);
  }
  let counted = 0;
  for (const node of forest.nodes) {
    for (const other of linksOf(forest, node.id)) {
      assert.ok(fromLinks.has(`${node.id}|${other.id}`),
        `${node.id} unlocks ${other.id} with no line drawn between them`);
      counted++;
    }
  }
  assert.equal(counted, fromLinks.size, 'a line is drawn that unlocks nothing');
});

test('taking a node makes exactly the nodes it is drawn joined to takeable', () => {
  // the oddball from the report: "+8% experience", out on a diagonal between two arms
  const odd = forest.nodes.find(n => n.oddball && n.desc.includes('experience'));
  assert.ok(odd, 'the experience oddball is gone from the tree');
  assert.ok(ODDBALLS.some(o => o.stat === 'xpFind'));

  const player = { level: 40, perks: [] };
  // walk to it first — it is three nodes out, which is the point of the forest
  const route = [];
  const seen = new Set(['start']);
  const queue = [['start', []]];
  while (queue.length) {
    const [at, path] = queue.shift();
    if (at === odd.id) { route.push(...path); break; }
    for (const next of forest.neighbours.get(at) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([next, [...path, next]]);
    }
  }
  for (const id of route) assert.ok(allocate(player, forest, id).ok, `could not walk to ${id}`);
  assert.ok(takenOf(player).has(odd.id));

  const joined = linksOf(forest, odd.id).map(n => n.id);
  for (const id of joined) {
    if (takenOf(player).has(id)) continue;
    assert.ok(canTake(player, forest, id).ok, `${id} has a line to the oddball and will not unlock`);
  }
  // …and a node with no line to anything you hold is still shut, with the reason the screen prints
  const taken = takenOf(player);
  const shut = forest.nodes.find(n => !taken.has(n.id)
    && !(forest.neighbours.get(n.id) || []).some(other => taken.has(other)));
  assert.ok(shut, 'every node in the tree is already reachable');
  const no = canTake(player, forest, shut.id);
  assert.equal(no.ok, false);
  assert.match(no.why, /connects to it yet/);
});

test('the guide circles are dotted and a link is not, so they cannot be read as the same thing', () => {
  // the bug was two 1px lines of almost the same colour: one meant "these are the same distance
  // out" and the other meant "taking this opens that"
  assert.match(hud, /setLineDash\(\[1\.5 \* dpr, 5 \* dpr\]\)/, 'the ring circles are solid again');
  assert.match(hud, /a solid line between two nodes|rgba\(126, 148, 190, \.38\)/,
    'the untaken link is back to being invisible');
  assert.match(html, /a solid line means taking one opens the other/,
    'the screen no longer says what a line means');
});

// ---------------------------------------------------------------- 4.3 one perk back

test('a perk on the end of a walk goes back; one in the middle says who needs it', () => {
  const player = { level: 40, perks: [] };
  const walk = ['melee:1:1', 'melee:2:1', 'melee:3:1'];
  for (const id of walk) assert.ok(allocate(player, forest, id).ok);

  const tip = canRefund(player, forest, 'melee:3:1');
  assert.equal(tip.ok, true);

  const middle = canRefund(player, forest, 'melee:2:1');
  assert.equal(middle.ok, false);
  assert.ok(middle.orphans.some(n => n.id === 'melee:3:1'));
  assert.match(middle.why, /reache?s? the middle through this one/);

  // and the refund itself: one point back, the rest of the walk untouched
  const before = spentBy(player);
  assert.ok(refundOne(player, forest, 'melee:3:1').ok);
  assert.equal(spentBy(player), before - 1);
  assert.deepEqual(player.perks, ['melee:1:1', 'melee:2:1']);

  // now the one that was in the middle is on the end, so it can go
  assert.equal(canRefund(player, forest, 'melee:2:1').ok, true);
});

test('the hub cannot be given back, and neither can a perk you never took', () => {
  const player = { level: 10, perks: ['melee:1:1'] };
  assert.equal(canRefund(player, forest, 'start').ok, false);
  assert.equal(canRefund(player, forest, 'melee:2:1').ok, false);
  assert.equal(canRefund(player, forest, 'no such node').ok, false);
  assert.equal(refundOne(player, forest, 'start').ok, false);
  assert.deepEqual(player.perks, ['melee:1:1']);
});

test('a node with two ways back to the middle is never load-bearing', () => {
  // ring neighbours make an arm a web rather than a comb, so a loop is normal and a refund inside
  // one must not be refused
  const player = { level: 40, perks: [] };
  for (const id of ['melee:1:0', 'melee:1:1', 'melee:2:1', 'melee:2:2']) allocate(player, forest, id);
  const held = player.perks.filter(id => canRefund(player, forest, id).ok);
  assert.ok(held.length >= 2, 'every node in a loop was called load-bearing');
  assert.deepEqual(orphanedBy(player, forest, 'melee:2:2'), []);
});

test('take it all back still empties the tree', () => {
  const player = { level: 40, perks: [] };
  for (const id of ['melee:1:1', 'melee:2:1']) allocate(player, forest, id);
  assert.equal(refundAll(player), 2);
  assert.deepEqual(player.perks, []);
});

test('the sheet offers the single refund and says why when it cannot', () => {
  assert.match(hud, /refundPerk\(id\)/, 'the hud has no way to hand one perk back');
  assert.match(hud, /Give this one back/);
  assert.match(hud, /canRefund\(player, forest, node\.id\)/);
  assert.match(css, /\.perk-refund-one/, 'the button has no style of its own');
});

// ---------------------------------------------------------------- 4.5 quests are not a menu

test('the journal shows work and no longer takes it', () => {
  const board = hud.slice(hud.indexOf('WORK GOING HERE'), hud.indexOf('WORD GOING ROUND'));
  assert.ok(board.length > 200, 'the work panel has moved');
  assert.doesNotMatch(board, /onclick = \(\) => \{ this\.onTakeJob/,
    'a journal row still takes the job');
  assert.match(board, /where the work is actually taken|board in town/);
  // the row says where instead of offering a button
  assert.match(board, /class="where"/);
  assert.doesNotMatch(board, /class="take"/);
});

test('there is one place a board job can still be taken, and the world has to open it', () => {
  assert.match(hud, /openNoticeBoard\(\{ where = '', title = 'Notice board' \} = \{\}\)/);
  assert.match(hud, /take\.onclick = \(\) => \{ this\.onTakeJob\?\.\(job\)/,
    'the notice board cannot take a job');
  assert.match(html, /id="noticeboard"/, 'the notice board has no markup');
  assert.match(css, /\.noticeboard \{/, 'the notice board has no style');
  // and nothing on the sheet or on a key opens it — main.js opens it when you walk up to a board
  assert.doesNotMatch(hud, /setTab\([^)]*\)[^\n]*openNoticeBoard/);
});

// ---------------------------------------------------------------- 4.11 the map key

test('every mark has a label, a group and a shape, and the key lists all of them', () => {
  const keys = Object.keys(MAP_MARKS);
  assert.equal(keys.length, MARK_ORDER.length, 'the key and the table hold different marks');
  for (const key of keys) {
    assert.ok(MARK_ORDER.includes(key), `${key} is drawn on the map and missing from the key`);
    const mark = MAP_MARKS[key];
    assert.ok(mark.label && mark.group && mark.shape, `${key} is not described`);
    assert.ok(mark.r > 0 && /^#[0-9a-f]{6}$/i.test(mark.fill), `${key} has no size or no colour`);
  }
});

test('the five settlement sizes step up, and the two biggest wear a ring', () => {
  const ladder = ['hamlet', 'village', 'town', 'city', 'capital'];
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(MAP_MARKS[ladder[i]].r > MAP_MARKS[ladder[i - 1]].r,
      `a ${ladder[i]} is not drawn bigger than a ${ladder[i - 1]}`);
  }
  assert.ok(MAP_MARKS.city.ring && MAP_MARKS.capital.ring);
  assert.ok(!MAP_MARKS.town.ring && !MAP_MARKS.village.ring);
});

test('a dungeon, a cave, a lair and a stronghold are four different marks', () => {
  const shapes = ['dungeon', 'cave', 'lair', 'camp', 'fort', 'castle'].map(k => MAP_MARKS[k].shape);
  assert.notEqual(MAP_MARKS.dungeon.shape, MAP_MARKS.cave.shape);
  assert.notEqual(MAP_MARKS.cave.shape, MAP_MARKS.lair.shape);
  assert.notEqual(MAP_MARKS.dungeon.shape, MAP_MARKS.camp.shape);
  assert.equal(new Set(shapes).size >= 4, true, 'the underground and the held ground share silhouettes');
  // a castle is the same silhouette as a fort at a different size and colour, which is the ladder
  assert.equal(MAP_MARKS.castle.shape, MAP_MARKS.fort.shape);
  assert.ok(MAP_MARKS.castle.r > MAP_MARKS.fort.r);
});

test('markFor speaks all three of the vocabularies the world uses for a place', () => {
  assert.equal(markFor({ type: 'settlement', kind: 'capital' }), 'capital');
  assert.equal(markFor({ type: 'settlement', kind: 'hamlet' }), 'hamlet');
  // an unknown tier still lands on a settlement mark rather than falling off the map
  assert.equal(markFor({ type: 'settlement', kind: 'outpost' }), 'village');
  assert.equal(markFor({ type: 'port', kind: 'port' }), 'port');
  assert.equal(markFor({ type: 'dungeon', kind: 'dungeon' }), 'dungeon');
  assert.equal(markFor({ type: 'dungeon', kind: 'lair' }), 'lair');
  assert.equal(markFor({ type: 'landmark', kind: 'cave' }), 'cave');
  // js/sites.js pins, which are a glyph per stronghold type — read, never rewritten
  assert.equal(markFor({ family: 'stronghold', pin: { glyph: 'castle' } }), 'castle');
  assert.equal(markFor({ family: 'stronghold', pin: { glyph: 'tower' } }), 'fort');
  assert.equal(markFor({ family: 'stronghold', pin: { glyph: 'siege' } }), 'fort');
  assert.equal(markFor({ family: 'stronghold', pin: { glyph: 'lair' } }), 'lair');
  assert.equal(markFor({ family: 'stronghold', pin: { glyph: 'cult' } }), 'camp');
  assert.equal(markFor({ family: 'landmark', pin: { glyph: 'shrine' } }), 'landmark');
  // and anything the map has no mark for is left off rather than drawn as a mystery dot
  assert.equal(markFor({ type: 'landmark', kind: 'ancientwood' }), null);
  assert.equal(markFor(null), null);
});

test('drawMark draws something for every mark, through one canvas API', () => {
  // a stand-in for the 2D context: every mark must fill or stroke a path, and none of them may
  // reach for a call the key's little 22px canvas does not have
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, name) => {
      if (name === 'lineWidth' || name === 'strokeStyle' || name === 'fillStyle') return 0;
      return (...args) => calls.push(`${String(name)}(${args.length})`);
    },
    set: () => true,
  });
  for (const key of MARK_ORDER) {
    calls.length = 0;
    drawMark(ctx, key, 11, 11, 1);
    assert.ok(calls.includes('beginPath(0)'), `${key} draws no path`);
    assert.ok(calls.some(c => c.startsWith('fill(') || c.startsWith('stroke(')),
      `${key} draws a path and never puts ink on it`);
  }
  // an unknown mark is a no-op rather than a crash on a live map
  calls.length = 0;
  drawMark(ctx, 'no such mark', 0, 0, 1);
  assert.equal(calls.length, 0);
});

test('the map screen draws the places itself and the key is built from the same table', () => {
  const map = read('../js/map.js');
  assert.match(map, /layers: \{ \.\.\.state\.layers, nodes: false \}/,
    'World Forge is drawing its own node dots underneath ours again');
  assert.match(map, /function drawPlaces\(/);
  assert.match(map, /drawMark\(ctx, name, 11, 11/, 'the key swatches are not drawn by drawMark');
  assert.match(css, /\.map-key-swatch/, 'the key has no style');
});
