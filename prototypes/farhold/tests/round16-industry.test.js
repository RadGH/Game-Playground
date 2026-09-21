// node --test prototypes/farhold/tests/round16-industry.test.js
//
// R16 — THE SPLIT, AND HOLDING E.
//
//   "Drills and similar resource extraction devices should be on their own building menu and are
//    automated, separate from manufacturing devices which require work to be done by the player or
//    NPC. Players can contribute work by holding E, and the progress bar should be indicated over
//    the structure. NPCs can also work automatically and the player can jump in to help make it go
//    faster."
//
// Five things this file will not let go of, in the order the sentence above says them:
//
//   1. THERE ARE TWO CATEGORIES and every structure is in exactly one of them.
//   2. AN EXTRACTION PIECE CAN NEVER WANT A WORKER. Not "does not today" — cannot: it is not a
//      js/refining.json machine, so js/refine.js has no way to post a labour order for it. This is
//      the invariant the whole split rests on and it is checked from both ends.
//   3. YOUR UNITS AND A CITIZEN'S UNITS LAND IN ONE ORDER. One `done`, one ledger, one credit line.
//      If this ever stops being true, "the player can jump in to help" has quietly become "the
//      player runs a second invisible system beside the one the citizens use".
//   4. NO WORKER AND NO POWER MEANS NO PROGRESS, and either one of them means progress.
//   5. Everything R16 added is exercised: the switch, the priority, the batch counts, the credit
//      line, the category migration on load, and a board that survives a save.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorks, createHandWork } from '../js/refine.js';
import { WorkBoard, createOrder, addWork, ledgerRows, creditLine, progressFraction } from '../js/work.js';
import { createStoreNetwork } from '../js/stores.js';
import { createBuildPlan } from '../js/buildplan.js';
import { roleOf } from '../js/outposts.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const STR = read('../data/structures.json');
const RES = read('../data/resources.json');
const REF = read('../data/refining.json');
const POW = read('../data/power.json');
const COL = read('../data/colony.json');

const byId = Object.fromEntries(STR.structures.map(s => [s.id, s]));

// ---------------------------------------------------------------- 1. the split

test('R16.1 — extraction and refining are two categories, and every piece is in exactly one', () => {
  assert.ok(STR.categories.extract, 'there is an Extraction category');
  assert.ok(STR.categories.refine, 'and Refining is still there');
  assert.notEqual(STR.categories.extract.name, STR.categories.refine.name);

  // the category list drives the panel's buttons, so a structure in no category is a piece the
  // player can never reach
  const cats = Object.keys(STR.categories);
  for (const s of STR.structures) {
    assert.ok(cats.includes(s.cat), `${s.id} is in category "${s.cat}", which does not exist`);
  }
  // …and a piece cannot be in two, because `cat` is one string. What CAN go wrong is a drill left
  // behind in Refining, so name the three by hand: this is the list the user will see.
  const extract = STR.structures.filter(s => s.cat === 'extract').map(s => s.id).sort();
  assert.deepEqual(extract, ['drill', 'pump', 'small_drill']);
  for (const id of extract) assert.ok(byId[id].needs, `${id} must be pinned to world geometry by \`needs\``);

  // ids are a save's business and none of them moved
  for (const id of ['small_drill', 'drill', 'pump', 'furnace', 'smelter', 'tender_arm']) {
    assert.ok(byId[id], `${id} is still in the catalogue under its own id`);
  }
  // Extraction must come before Refining in the panel, because you dig before you refine and the
  // button order is `Object.keys(categories)`
  assert.ok(cats.indexOf('extract') < cats.indexOf('refine'), 'dig, then refine');
});

test('R16.1 — the Extraction pieces read as a mine, not a workshop', () => {
  // js/outposts.js `roleOf` had an id list that had never heard of the Small Drill, which is the
  // first drill anybody builds
  const at = (key, x) => ({ id: 'e' + x, key, cat: byId[key].cat, x, z: 0 });
  assert.equal(roleOf([at('small_drill', 0), at('small_drill', 4)]), 'mine');
  assert.equal(roleOf([at('drill', 0), at('storage_crate', 4)]), 'mine');
  assert.equal(roleOf([at('furnace', 0), at('anvil', 4)]), 'works');
});

// ---------------------------------------------------------------- 2. extraction is automated

test('R16.2 — an extraction structure is not a refining machine, so it can never ask for a worker', () => {
  for (const s of STR.structures.filter(x => x.cat === 'extract')) {
    assert.ok(!REF.machines[s.id],
      `${s.id} is in the Extraction menu AND is a refining machine — it would post labour orders`);
  }
  // and the other way round: nothing that IS a machine may sit in the Extraction menu
  for (const id of Object.keys(REF.machines)) {
    assert.notEqual(byId[id]?.cat, 'extract', `${id} is a machine and must not be in Extraction`);
  }
  // every machine a player can build is in a menu that says somebody may be needed
  for (const id of Object.keys(REF.machines)) {
    assert.ok(byId[id], `${id} is a machine with no structure — it could never be built`);
    assert.ok(['refine', 'craft', 'trade'].includes(byId[id].cat), `${id} is filed under "${byId[id].cat}"`);
  }
});

test('R16.2 — a base of drills posts no labour orders at all', () => {
  const { works, board } = bench();
  // the drills are NOT placed as works machines — that is the point, and it is how the game does
  // it: js/main.js only calls `works.place` when `works.machineDefs[key]` exists
  for (const id of ['small_drill', 'drill', 'pump']) assert.ok(!works.machineDefs[id]);
  assert.equal(works.postLabour(board, { at: 0 }), 0);
  assert.equal(board.open().length, 0, 'nobody has been asked to turn a drill by hand');
});

// ---------------------------------------------------------------- 3. one order, three sources

/** A works + a board + a pool with plenty of ore and fuel in it. */
function bench({ powered = false } = {}) {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  // four crates, so the pool has room for everything these tests feed it
  for (let i = 0; i < 4; i++) stores.add({ id: 'crate' + i, type: 'storage_crate', x: i * 3, z: 0, name: 'Crate' });
  const pool = stores.poolAt(0, 0);
  for (const [res, n] of Object.entries({ iron_ore: 200, coal: 100, log: 100, fibre: 200, water: 100 })) stores.put(pool, res, n);
  /**
   * A grid that is simply ON. This file is arguing about js/refine.js's labour rule, not about
   * js/power.js's load shedding — tests/industry.test.js owns that — and a real burner generator
   * would want fuel, a tick and a pole before `poweredOf` came back above zero.
   */
  const grid = powered ? { poweredOf: () => 1, stateOf: () => 'on', add() {}, remove() {}, setBusy() {} } : null;
  const works = createWorks({ refining: REF, resources: { materials: {} }, stores, grid, labour: COL.labour });
  return { works, board: new WorkBoard(), stores, grid, pool };
}

test('R16.3 — a swing of yours and a citizen\'s shift land in the SAME order, and the ledger says so', () => {
  const { works, board } = bench();
  works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  works.queue('f1', 'smelt_iron', 5);
  assert.equal(works.postLabour(board, { at: 0 }), 1);

  const order = board.get('lab_f1');
  assert.ok(order, 'the furnace has one order, and it is named for the machine');
  assert.equal(order.stationId, 'f1');
  assert.equal(order.tag, 'refine', 'the same tag data/colony.json gives the Smelter job');

  board.swing(order, { units: 1.5, by: 'player', byName: 'You' });
  board.work(order, { source: 'citizen', by: 'c7', byName: 'Marwen', units: 1 });
  board.runMachines([{ id: 'arm', stationId: 'f1', unitsPerHour: 6, powered: true }], 0.25);

  // ONE counter, not three
  assert.equal(order.done, 4, 'four units, out of three pairs of hands, in one place');
  assert.equal(order.complete, true);
  const rows = ledgerRows(order);
  assert.deepEqual(rows.map(r => r.source).sort(), ['citizen', 'machine', 'player']);
  assert.equal(rows.reduce((n, r) => n + r.units, 0), 4);
  // …and the sentence that makes a citizen a person rather than a production rate
  const line = creditLine(order);
  assert.match(line, /Marwen/);
  assert.match(line, /You/);
});

test('R16.3 — helping by hand makes the job finish sooner, which is the whole of "jump in"', () => {
  const alone = createOrder({ id: 'a', tag: 'refine', units: 4 });
  const helped = createOrder({ id: 'b', tag: 'refine', units: 4 });
  // the same citizen, the same shift, on both
  for (let i = 0; i < 6; i++) {
    addWork(alone, { units: 0.5, source: 'citizen', by: 'c1', byName: 'Marwen' });
    addWork(helped, { units: 0.5, source: 'citizen', by: 'c1', byName: 'Marwen' });
    addWork(helped, { units: 0.4, source: 'player', by: 'player', byName: 'You' });
  }
  assert.equal(helped.complete, true);
  assert.equal(alone.complete, false);
  assert.ok(progressFraction(helped) > progressFraction(alone));
});

// ---------------------------------------------------------------- 4. no worker, no progress

test('R16.4 — a machine with nobody at it and no power makes nothing; either one of them and it runs', () => {
  // cold: a furnace always wants hands (data/refining.json `auto: false`)
  const cold = bench();
  cold.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  cold.works.queue('f1', 'smelt_iron', 5);
  cold.works.catchUp(300);
  assert.equal(cold.works.get('f1').made, 0, 'standing cold');
  assert.equal(cold.works.snapshot('f1').state, 'unworked');

  // …and the same furnace, worked. Four units is two minutes of furnace.
  const warm = bench();
  warm.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  warm.works.queue('f1', 'smelt_iron', 5);
  warm.works.postLabour(warm.board, { at: 0 });
  warm.board.swing('lab_f1', { units: 4, by: 'player', byName: 'You' });
  warm.works.collectLabour(warm.board);
  warm.works.catchUp(300);
  assert.ok(warm.works.get('f1').made > 0, 'somebody worked it, so it made something');

  // a tier-1 bench wants hands UNTIL it is wired, which is the promotion `auto: true` describes
  const wired = bench({ powered: true });
  wired.works.place({ id: 's1', type: 'sawmill', x: 0, z: 0 });
  assert.equal(wired.works.labourNeed(wired.works.get('s1')), 0, 'the grid is carrying it, so it pays its own labour');
  const dry = bench();
  dry.works.place({ id: 's1', type: 'sawmill', x: 0, z: 0 });
  assert.ok(dry.works.labourNeed(dry.works.get('s1')) > 0, 'off the grid it wants a person');

  // a tier-2 machine never wants hands at all — power is the whole cost
  const two = bench({ powered: true });
  two.works.place({ id: 'r1', type: 'refinery', x: 0, z: 0 });
  assert.equal(two.works.labourNeed(two.works.get('r1')), 0);
});

// ---------------------------------------------------------------- hold E

/** The player standing at a machine. `entry` is the build entry js/main.js hands `machineAt`. */
function hands(b, id = 'f1', { speed = 1 } = {}) {
  const entry = { id, name: 'Furnace', x: 0, y: 2, z: 0, h: 2.4 };
  return createHandWork({
    works: b.works, board: b.board, machineAt: () => entry, speed: () => speed, onLog: () => {},
  });
}

test('R16 hold E — the bar over the structure is the ORDER\'s progress, not a clock of its own', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  b.works.queue('f1', 'smelt_iron', 5);
  const hand = hands(b);

  hand.tick(1, { at: 0, holding: true });
  const order = b.board.get('lab_f1');
  assert.ok(order, 'holding E posted the order itself rather than waiting a second for the sweep');
  const bar = hand.bar();
  assert.ok(bar, 'there is a bar while the key is down');
  assert.equal(bar.fraction, progressFraction(order), 'the bar IS the order');
  assert.equal(bar.x, 0);
  assert.ok(bar.y > 2, 'and it floats above the structure rather than at its foot');
  assert.match(bar.label, /Furnace/);

  // a citizen filling the same order moves the player's bar, which a local clock could never do
  const before = hand.bar().fraction;
  b.board.work(order, { source: 'citizen', by: 'c1', byName: 'Marwen', units: 1 });
  hand.tick(0, { at: 0, holding: true });
  assert.ok(hand.bar().fraction > before, 'somebody helped and your bar moved');
});

test('R16 hold E — your units go in as `player`, and holding is faster than standing there', () => {
  const held = bench();
  held.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  held.works.queue('f1', 'smelt_iron', 5);
  hands(held).tick(1, { at: 0, holding: true });

  const stood = bench();
  stood.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  stood.works.queue('f1', 'smelt_iron', 5);
  hands(stood).tick(1, { at: 0, holding: false });

  const a = held.board.get('lab_f1'), c = stood.board.get('lab_f1');
  assert.equal(a.ledger.machine, 0);
  assert.equal(a.ledger.citizen, 0);
  assert.ok(a.ledger.player > 0, 'it is YOU doing it');
  assert.ok(a.done > c.done * 2, `holding ${a.done} should beat standing ${c.done} by a lot`);
  // …and no bar when you are only standing near it, or one would be up for most of the game
  assert.equal(hands(stood).tick(0.1, { at: 0, holding: false })?.bar, null);
});

test('R16 hold E — a better tool works a bench faster, and an automated machine refuses your help', () => {
  const slow = bench(); slow.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 }); slow.works.queue('f1', 'smelt_iron', 5);
  const fast = bench(); fast.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 }); fast.works.queue('f1', 'smelt_iron', 5);
  hands(slow, 'f1', { speed: 1 }).tick(1, { at: 0, holding: true });
  hands(fast, 'f1', { speed: 2 }).tick(1, { at: 0, holding: true });
  assert.ok(fast.board.get('lab_f1').done > slow.board.get('lab_f1').done);

  // a refinery is the automated half: holding E at one puts in nothing and raises no bar
  const auto = bench({ powered: true });
  auto.works.place({ id: 'r1', type: 'refinery', x: 0, z: 0 });
  auto.works.queue('r1', 'refine_alloy', 1);
  const h = createHandWork({
    works: auto.works, board: auto.board, onLog: () => {},
    machineAt: () => ({ id: 'r1', name: 'Refinery', x: 0, y: 1, z: 0, h: 3 }),
  });
  assert.equal(h.tick(1, { at: 0, holding: true }), null);
  assert.equal(h.bar(), null);
  assert.equal(auto.board.open().length, 0);
});

test('R16 hold E — a switched-off bench, an empty queue and a full bank all refuse, quietly', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  const hand = hands(b);

  assert.equal(hand.tick(1, { at: 0, holding: true }), null, 'nothing queued, nothing to work');

  b.works.queue('f1', 'smelt_iron', 5);
  b.works.setEnabled('f1', false);
  assert.equal(hand.tick(1, { at: 0, holding: true }), null, 'switched off');
  assert.equal(b.board.open().length, 0);

  b.works.setEnabled('f1', true);
  b.works.credit('f1', 99);                     // bank full to the cap
  assert.equal(hand.tick(1, { at: 0, holding: true }), null, 'it has all the work it can hold');
});

// ---------------------------------------------------------------- 5. what R16 added

test('R16.5 — the switch: a bench you turned off stops, stops asking for a worker, and keeps its queue', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  b.works.queue('f1', 'smelt_iron', 5);
  assert.equal(b.works.postLabour(b.board, { at: 0 }), 1);
  b.board.swing('lab_f1', { units: 4, by: 'player', byName: 'You' });
  b.works.collectLabour(b.board);

  assert.equal(b.works.setEnabled('f1', false), false);
  assert.equal(b.works.snapshot('f1').stateText, 'Switched off');
  b.works.postLabour(b.board, { at: 1 });
  assert.equal(b.board.open().length, 0, 'nobody is asked to walk to a machine you switched off');
  const made = b.works.get('f1').made;
  b.works.catchUp(300);
  assert.equal(b.works.get('f1').made, made, 'and it makes nothing while it is off');

  b.works.setEnabled('f1', true);
  assert.equal(b.works.get('f1').queue.length, 1, 'the queue was never touched');
  b.works.catchUp(120);
  assert.ok(b.works.get('f1').made > made, 'and it carries on from where it was');
});

test('R16.5 — priority: a machine you marked First is the one the next worker free walks to', () => {
  const b = bench();
  b.works.place({ id: 'loom', type: 'loom', x: 0, z: 0 });
  b.works.place({ id: 'f1', type: 'furnace', x: 4, z: 0 });
  b.works.queue('loom', 'spin_cloth', 5);
  b.works.queue('f1', 'smelt_iron', 5);
  b.works.postLabour(b.board, { at: 0 });

  // nothing set: oldest first, which is the loom
  assert.equal(b.board.nextFor({ tags: ['refine'] }).stationId, 'loom');

  b.works.setPriority('f1', 2);
  b.works.postLabour(b.board, { at: 1 });                 // the open order follows the machine
  assert.equal(b.board.get('lab_f1').priority, 2);
  assert.equal(b.board.nextFor({ tags: ['refine'] }).stationId, 'f1', 'the furnace now wins');

  b.works.setPriority('f1', 0);
  b.works.postLabour(b.board, { at: 2 });
  assert.equal(b.board.nextFor({ tags: ['refine'] }).stationId, 'loom', 'and Last puts it back');
  // it is clamped, because it is an order's priority and not a free number
  assert.equal(b.works.setPriority('f1', 99), 2);
  assert.equal(b.works.setPriority('f1', -5), 0);
});

test('R16.5 — batches and standing orders: `queue` has always taken a count, and 0 means keep going', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  assert.equal(b.works.queue('f1', 'smelt_iron', 20).job.left, 20);
  assert.equal(b.works.queue('f1', 'smelt_iron', 0).job.left, Infinity, 'a standing order');
  const jobs = b.works.allJobs();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].left, 20);
  // and a standing order survives a save, as -1
  const saved = b.works.toJSON();
  assert.equal(saved.machines[0].queue[1].left, -1);
});

test('R16.5 — the credit line reaches the machine, so a bench can say who kept it lit', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  b.works.queue('f1', 'smelt_iron', 5);
  b.works.postLabour(b.board, { at: 0 });
  b.board.swing('lab_f1', { units: 2.5, by: 'player', byName: 'You' });
  b.board.work('lab_f1', { source: 'citizen', by: 'c1', byName: 'Marwen', units: 1.5 });
  assert.equal(b.works.collectLabour(b.board), 4);

  const snap = b.works.snapshot('f1');
  assert.match(snap.lastCredit, /You/);
  assert.match(snap.lastCredit, /Marwen/);
  assert.ok(snap.workBank > 0, 'and the four units bought two minutes of furnace');
  // paying twice for the same four units is the one thing `collectLabour` must never do
  assert.equal(b.works.collectLabour(b.board), 0);
});

test('R16.5 — an order for a bench you took down does not sit on the board for ever', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  b.works.queue('f1', 'smelt_iron', 5);
  b.works.postLabour(b.board, { at: 0 });
  assert.equal(b.board.open().length, 1);
  b.works.remove('f1');
  b.works.postLabour(b.board, { at: 1 });
  assert.equal(b.board.open().length, 0, 'nobody pours a shift into a patch of grass');
});

// ---------------------------------------------------------------- saves

test('R16 — an old save still loads: the ids did not move and the category is re-derived', () => {
  // exactly what a pre-R16 save holds: a drill filed under the category it used to be in
  const saved = {
    v: 1,
    entries: [
      { id: 'b1', key: 'drill', name: 'Drill', cat: 'refine', x: 10, z: 0, rot: 0, w: 2.8, d: 2.8, h: 3.4, y: 0 },
      { id: 'b2', key: 'furnace', name: 'Furnace', cat: 'refine', x: 0, z: 0, rot: 0, w: 2, d: 2, h: 2, y: 0 },
    ],
    claims: [],
  };
  const plan = createBuildPlan({ catalogue: STR, terrain: { heightAt: () => 0, slopeAt: () => 0 }, saved });
  assert.equal(plan.entries.length, 2, 'the save loaded');
  assert.equal(plan.entries[0].key, 'drill', 'and the id — which is what a save really depends on — did not move');
  assert.equal(plan.entries[0].cat, 'extract', 'the stale category was re-read from the catalogue');
  assert.equal(plan.entries[1].cat, 'refine');
  assert.equal(roleOf(plan.entries), 'mine');

  // one place answers "does this dig", for main.js and for the panel
  assert.equal(plan.isExtractor('drill'), true);
  assert.equal(plan.isExtractor('pump'), true);
  assert.equal(plan.isExtractor('furnace'), false);
});

test('R16 — a board written into a save comes back with its orders on it', () => {
  const board = new WorkBoard();
  board.postJob({ id: 'lab_f1', tag: 'refine', stationId: 'f1', name: 'Work the Furnace', units: 4 });
  board.work('lab_f1', { source: 'citizen', by: 'c1', byName: 'Marwen', units: 1.5 });
  const json = JSON.parse(JSON.stringify(board.toJSON()));

  const back = new WorkBoard(json);
  assert.equal(back.open().length, 1, 'the half-finished order is still there');
  const o = back.get('lab_f1');
  assert.equal(o.done, 1.5, 'and so is the shift Marwen had already put into it');
  assert.match(creditLine(o), /Marwen/);
  // it still behaves like an order: the player can finish what the citizen started
  back.swing('lab_f1', { units: 2.5, by: 'player', byName: 'You' });
  assert.equal(o.complete, true);

  // an empty save is still an empty board, which is what every existing call site relies on
  assert.equal(new WorkBoard({}).open().length, 0);
  assert.equal(new WorkBoard().open().length, 0);
});

test('R16 — labour is paid as it goes in, so an attended furnace never stands cold for two minutes', () => {
  const b = bench();
  b.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  b.works.queue('f1', 'smelt_iron', 5);
  const hand = hands(b);

  // one second of simply standing there: R15's rule is that attending a machine keeps it lit 1:1,
  // so a second of your time must buy about a second of furnace — not nothing until the four-unit
  // order finishes two minutes later
  hand.tick(1, { at: 0, holding: false });
  const bank = b.works.get('f1').workBank;
  assert.ok(bank > 0.5 && bank < 2, `a second of standing bought ${bank} seconds of furnace`);
  assert.equal(b.board.get('lab_f1').complete, false, 'and the order is nowhere near finished');

  // …and holding buys about three times as much for the same second
  const held = bench();
  held.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  held.works.queue('f1', 'smelt_iron', 5);
  hands(held).tick(1, { at: 0, holding: true });
  assert.ok(held.works.get('f1').workBank > bank * 2);

  // a citizen halfway through an order buys the machine something too — this used to be zero
  const part = bench();
  part.works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
  part.works.queue('f1', 'smelt_iron', 5);
  part.works.postLabour(part.board, { at: 0 });
  part.board.work('lab_f1', { source: 'citizen', by: 'c1', byName: 'Marwen', units: 1 });
  assert.equal(part.works.collectLabour(part.board), 1);
  assert.equal(part.works.get('f1').workBank, 30, 'one unit is thirty seconds of furnace');
  // and sweeping again pays nothing, however many times it is called
  assert.equal(part.works.collectLabour(part.board), 0);
  assert.equal(part.works.collectLabour(part.board), 0);
  part.board.work('lab_f1', { source: 'citizen', by: 'c1', byName: 'Marwen', units: 1 });
  assert.equal(part.works.collectLabour(part.board), 1, 'only the new unit');
});
