// node --test prototypes/farhold/tests/orphans-a.test.js
//
// R19 — FIVE RULES THAT WERE WRITTEN INTO A DATA FILE AND READ BY NOBODY.
//
// This project's signature fault, found again by a code review: a knob is parsed at boot, carries a
// paragraph explaining what it is for, and not one line of code ever asks for it. It is worse than a
// missing feature because the file says the feature is there — and much harder to spot than a crash,
// because the game runs perfectly well on whatever the code hard-coded instead.
//
//   1. data/colony.json  tax.unhousedPays / tax.grumblingPays  -> js/colony.js collectTax
//   2. data/colony.json  guard.wardRadius                      -> js/colony.js stationed + js/defence.js
//   3. data/crops.json   crops[].seedCost                      -> js/farm.js applyOrder
//   4. data/power.json   machineStates                         -> js/power.js + js/refine.js
//   5. data/resources.json rareSeam.weightPerUnit (and .stack)  -> js/resources.js haulReport
//
// EVERY TEST HERE SETS THE KNOB TO AN UNUSUAL VALUE AND ASSERTS THE BEHAVIOUR MOVED. A test that
// compares the data file against a constant would pass just as happily against the code that
// ignored it, which is exactly how these five survived this long.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { WorkBoard } from '../js/work.js';
import { createColony } from '../js/colony.js';
import { createFarm } from '../js/farm.js';
import { createDefence } from '../js/defence.js';
import { createGrid } from '../js/power.js';
import { createWorks } from '../js/refine.js';
import { haulReport, breakEvenAgainst, bandFor } from '../js/resources.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const COLONY = read('../data/colony.json');
const CROPS = read('../data/crops.json');
const POW = read('../data/power.json');
const RES = read('../data/resources.json');
const REF = read('../data/refining.json');
const RAIDS = read('../data/raids.json');

/** A copy of a data file with one nested value changed, so the original is never mutated. */
const tweak = (data, path, value) => {
  const out = structuredClone(data);
  const keys = path.split('.');
  let at = out;
  for (const k of keys.slice(0, -1)) at = at[k];
  at[keys[keys.length - 1]] = value;
  return out;
};

// ================================================================ 1. the tax rules

/**
 * `collectTax` skipped an unhoused citizen and a grumbling one with a bare `continue`, right beside
 * the two knobs that state what each of them pays. Same value (0), so the same behaviour — which is
 * why nobody noticed. They are SHARES of the full rate, so the test turns each one up and checks the
 * purse and the paid/skipped lists move with it.
 */
function twoCitizens(data, { beds = 2 } = {}) {
  const colony = createColony({ data, seed: 7, name: 'Test' });
  const a = colony.welcome(colony.newCitizen({ id: 'a', name: 'Ardwen', job: 'labourer' }));
  const b = colony.welcome(colony.newCitizen({ id: 'b', name: 'Brienor', job: 'labourer' }));
  colony.setBeds(beds);
  a.mood = 0.7; b.mood = 0.7;
  return { colony, a, b };
}

test('R19 §1 tax.unhousedPays: a citizen with no bed pays the share the data names, not a hard-coded nothing', () => {
  // as shipped: unhousedPays is 0, and somebody sleeping rough is skipped for "no bed"
  const shipped = twoCitizens(COLONY, { beds: 1 });
  assert.equal(shipped.a.home != null, true, 'the one bed did not go to the first citizen');
  assert.equal(shipped.b.home, null, 'the second citizen should be sleeping rough');
  const before = shipped.colony.collectTax();
  assert.equal(before.paid.length, 1);
  assert.deepEqual(before.skipped.map(s => s.why), ['no bed']);

  // turn the knob to half. The SAME rough-sleeping citizen now puts half a day's tax in.
  const half = twoCitizens(tweak(COLONY, 'tax.unhousedPays', 0.5), { beds: 1 });
  const after = half.colony.collectTax();
  assert.equal(after.skipped.length, 0, 'nobody should be skipped once unhoused pays something');
  assert.equal(after.paid.length, 2);
  const rough = after.paid.find(p => p.id === 'b');
  assert.equal(rough.share, 0.5, 'the share the citizen paid at is not reported');
  assert.ok(rough.gold > 0, 'an unhoused citizen paid nothing with unhousedPays at 0.5');
  assert.ok(after.tax > before.tax, `tax did not move: ${before.tax} -> ${after.tax}`);

  // and the housed one is untouched by the knob, which is what makes it a SHARE and not a rescale
  const housedBefore = before.paid.find(p => p.id === 'a').gold;
  assert.equal(after.paid.find(p => p.id === 'a').gold, housedBefore);
  assert.equal(rough.gold, Math.round(housedBefore * 0.5 * 100) / 100);
});

test('R19 §1 tax.grumblingPays: a hungry citizen pays the share the data names', () => {
  const rungs = COLONY.food.rungs;
  const hunger = (rungs.grumbling + rungs.downsTools) / 2;   // squarely on the grumbling rung

  const shipped = twoCitizens(COLONY, { beds: 2 });
  shipped.b.hunger = hunger;
  const before = shipped.colony.collectTax();
  assert.deepEqual(before.skipped.map(s => s.why), ['grumbling'], 'a grumbling citizen should pay nothing as shipped');

  const quarter = twoCitizens(tweak(COLONY, 'tax.grumblingPays', 0.25), { beds: 2 });
  quarter.b.hunger = hunger;
  const after = quarter.colony.collectTax();
  assert.equal(after.skipped.length, 0);
  assert.equal(after.paid.find(p => p.id === 'b').share, 0.25);
  assert.ok(after.tax > before.tax, `grumblingPays did not reach the purse: ${before.tax} -> ${after.tax}`);
});

test('R19 §1 no bed beats a full belly: unhoused is tested first, as it always was', () => {
  // grumblingPays generous, unhousedPays still zero: somebody who is both is skipped for the BED,
  // because the bed is the thing the player can do something about tonight.
  const data = tweak(tweak(COLONY, 'tax.grumblingPays', 1), 'tax.unhousedPays', 0);
  const { colony, b } = twoCitizens(data, { beds: 1 });
  b.hunger = (COLONY.food.rungs.grumbling + COLONY.food.rungs.downsTools) / 2;
  const out = colony.collectTax();
  assert.deepEqual(out.skipped.map(s => s.why), ['no bed']);
});

// ================================================================ 2. how far a guard reaches

/**
 * `guard.wardRadius` has said 90 metres since the Civilization Expansion landed and nothing read it,
 * so a guard posted at the outlying mine was a point of defence for the home base four hundred
 * metres away — raising its raid tier for a wall they could not see. Two posts, two guards, one
 * radius: the count has to move when the radius does.
 */
function wardColony(data) {
  const colony = createColony({ data, seed: 3, name: 'Ward' });
  colony.setBeds(2);
  const near = colony.welcome(colony.newCitizen({ id: 'g1', name: 'Near', job: 'guard' }));
  const far = colony.welcome(colony.newCitizen({ id: 'g2', name: 'Far', job: 'guard' }));
  colony.setPosts([
    { id: 'p_home', name: 'Watch Post', slots: 1, x: 0, z: 0 },
    { id: 'p_mine', name: 'Watch Post', slots: 1, x: 400, z: 0 },
  ]);
  assert.equal(colony.station(near.id, 'p_home').ok, true);
  assert.equal(colony.station(far.id, 'p_mine').ok, true);
  return colony;
}

test('R19 §2 guard.wardRadius: only guards posted inside it count as defending a spot', () => {
  const shipped = wardColony(COLONY);
  assert.equal(shipped.wardRadius(), COLONY.guard.wardRadius);
  // asked with no spot at all, it is still "how many of my folk are standing a post" — unchanged,
  // which is what keeps every existing caller and the forty-odd colony tests honest
  assert.equal(shipped.stationed(), 2);
  // asked about the home base, the guard four hundred metres out is not there
  assert.equal(shipped.stationed({ x: 0, z: 0 }), 1);
  assert.equal(shipped.stationed({ x: 400, z: 0 }), 1, 'the mine should be warded by its own guard');

  // stretch the radius past the mine and BOTH guards defend the home base
  const wide = wardColony(tweak(COLONY, 'guard.wardRadius', 600));
  assert.equal(wide.stationed({ x: 0, z: 0 }), 2, 'wardRadius 600 did not reach a post 400 m out');

  // shrink it and neither post covers the other
  const tight = wardColony(tweak(COLONY, 'guard.wardRadius', 5));
  assert.equal(tight.stationed({ x: 0, z: 0 }), 1);
  assert.equal(tight.stationed({ x: 200, z: 0 }), 0, 'a 5 m ward defended a spot 200 m away');
});

test('R19 §2 a post the game layer never handed in still counts: an unknown spot is not a distant one', () => {
  const colony = createColony({ data: COLONY, seed: 4, name: 'Unknown' });
  colony.setBeds(1);
  const g = colony.welcome(colony.newCitizen({ id: 'g', name: 'Ghost', job: 'guard' }));
  g.posted = 'p_nobody_registered';           // exactly what a pre-setPosts save looks like
  assert.equal(colony.stationed({ x: 0, z: 0 }), 1, 'guessing disarmed a base whose posts were not registered');
});

test('R19 §2 the join: the raid reads the watch that can reach the base being raided', () => {
  // a base at the origin; the guards are the two from wardColony, one at the base and one at the mine
  const buildOf = () => ({
    entries: [
      { id: 'e_stone', key: 'claim_stone', x: 0, z: 0 },
      { id: 'p_home', key: 'watch_post', x: 0, z: 0 },
      { id: 'p_mine', key: 'watch_post', x: 400, z: 0 },
    ],
    defOf: key => (key === 'watch_post' ? { cat: 'defence', post: { slots: 1 } }
      : key === 'claim_stone' ? { cat: 'build', claims: true }
      : { cat: 'build' }),
  });

  const shipped = createDefence({
    data: RAIDS, getBuild: buildOf, getColony: () => wardColony(COLONY),
  });
  assert.equal(shipped.base.posted, 1, 'the guard at the far mine was counted as defending the base');

  const wide = createDefence({
    data: RAIDS, getBuild: buildOf, getColony: () => wardColony(tweak(COLONY, 'guard.wardRadius', 600)),
  });
  assert.equal(wide.base.posted, 2, 'wardRadius 600 did not reach the mine post');
  assert.ok(wide.base.defences > shipped.base.defences,
    'the raid tier did not move when the ward reached further');
});

test('R19 §2 an empty claim is unchanged: nothing built means no spot to measure from', () => {
  const def = createDefence({
    data: RAIDS,
    getBuild: () => ({ entries: [], defOf: () => null }),
    getColony: () => wardColony(tweak(COLONY, 'guard.wardRadius', 1)),
  });
  // baseSpot() is null with nothing standing, so stationed() falls back to the whole watch
  assert.equal(def.base.posted, 2);
});

// ================================================================ 3. the seed

/** Grow one plot to ripe and reap it by hand. Returns the plot and the harvest event. */
function reapOnce(data, crop = 'grain') {
  const board = new WorkBoard();
  const farm = createFarm({ data, board });
  const { plot } = farm.layPlot({ crop, by: 'player' });
  farm.tick(data.crops.find(c => c.key === crop).growHours);
  const order = board.open().find(o => o.tag === 'harvest');
  assert.ok(order, 'a ripe plot posted no harvest order');
  board.swing(order.id, { units: order.units });
  const events = farm.tick(0);
  const harvested = events.find(e => e.kind === 'harvested');
  assert.ok(harvested, 'the harvest order finished and nothing was harvested');
  return { farm, board, plot, harvested };
}

test('R19 §3 crops[].seedCost: the next sowing comes off the top of the harvest', () => {
  const grain = CROPS.crops.find(c => c.key === 'grain');
  const shipped = reapOnce(CROPS);
  assert.equal(shipped.harvested.gross, grain.yield, 'a fresh plot at soil 1 should give its full yield');
  assert.equal(shipped.harvested.seed, grain.seedCost);
  assert.equal(shipped.harvested.count, grain.yield - grain.seedCost,
    'the store was credited with the gross, so seedCost is being ignored');
  assert.equal(shipped.farm.store.grain, grain.yield - grain.seedCost);
  assert.equal(shipped.plot.seed, grain.seedCost, 'the seed was not kept back on the plot');
  assert.equal(shipped.farm.report().seedHeld, grain.seedCost);

  // turn the knob up and the SAME harvest banks less, which is the whole point of the number
  const dear = reapOnce(tweak(CROPS, 'crops.0.seedCost', 3));
  assert.equal(dear.harvested.seed, 3);
  assert.equal(dear.farm.store.grain, grain.yield - 3);
  assert.ok(dear.farm.store.grain < shipped.farm.store.grain, 'a dearer seed banked the same grain');

  // turn it off and the old behaviour is exactly back
  const free = reapOnce(tweak(CROPS, 'crops.0.seedCost', 0));
  assert.equal(free.harvested.seed, 0);
  assert.equal(free.farm.store.grain, grain.yield);
  assert.equal(free.plot.seed, 0);
});

test('R19 §3 the replant sows what was kept back, and can never be short', () => {
  const { farm, board, plot } = reapOnce(tweak(CROPS, 'crops.0.seedCost', 3));
  // eat every last grain in the store before anybody replants — the soft-lock this design avoids
  farm.store.grain = 0;
  const order = board.open().find(o => o.tag === 'replant');
  assert.ok(order, 'stubble posted no replant order');
  board.swing(order.id, { units: order.units });
  const events = farm.tick(0);
  const replanted = events.find(e => e.kind === 'replanted');
  assert.equal(replanted.seed, 3, 'the handful kept back was not the thing that went in the hole');
  assert.equal(plot.state, 'growing', 'an empty store killed the field, which it must never do');
  assert.equal(plot.seed, 0);
  assert.equal(farm.report().seedHeld, 0);
});

test('R19 §3 tearing up a field gives the seed back rather than burning it', () => {
  const { farm, plot } = reapOnce(tweak(CROPS, 'crops.0.seedCost', 3));
  const before = farm.store.grain;
  assert.equal(farm.removePlot(plot.id, 'player').ok, true);
  assert.equal(farm.store.grain, before + 3);
});

test('R19 §3 a bad plot owes what it has: seed never exceeds the harvest', () => {
  // seedCost far above the yield. The harvest is all seed and the store gets nothing — it does not
  // go negative and the field still replants.
  const { farm, harvested, plot } = reapOnce(tweak(CROPS, 'crops.0.seedCost', 99));
  assert.equal(harvested.seed, harvested.gross);
  assert.equal(harvested.count, 0);
  assert.equal(farm.store.grain, 0);
  assert.equal(plot.seed, harvested.gross);
});

// ================================================================ 4. the badge words

/** A wind turbine and one machine on the same little grid. No fuel to worry about. */
function litGrid(power) {
  const grid = createGrid({ power });
  grid.add({ id: 'gen1', type: 'wind_turbine', x: 0, z: 0 });
  grid.add({ id: 'm1', type: 'smelter', name: 'Smelter', x: 5, z: 0, draw: 14, priority: 'refining' });
  grid.tick(1 / 60, { daylight: 1, wind: 1 });
  return grid;
}

test('R19 §4 machineStates: the declared list is what overview() tallies, and an undeclared word is named', () => {
  const shipped = litGrid(POW);
  assert.deepEqual(shipped.machineStates, POW.machineStates, 'the grid is not reading the data at all');
  assert.equal(shipped.stateOf('m1'), 'idle');
  const row = shipped.overview()[0];
  assert.equal(row.states.idle, 1, 'the idle machine was not tallied under its own state');
  assert.equal(row.states.running, 0, 'every declared state should have a count, even a zero');
  assert.deepEqual(row.undeclared, [], 'nothing should be holding an undeclared word as shipped');
  assert.deepEqual(Object.keys(row.states), POW.machineStates, 'the tally is not in the declared order');

  // now declare a different set. The machine is still 'idle'; the data no longer admits that word,
  // so it comes back NAMED rather than vanishing out of a tally nobody can paint.
  const odd = litGrid({ ...POW, machineStates: ['running', 'frozen'] });
  const oddRow = odd.overview()[0];
  assert.deepEqual(Object.keys(oddRow.states), ['running', 'frozen']);
  assert.equal(oddRow.states.frozen, 0);
  assert.equal(oddRow.states.idle, undefined, 'a state the data does not declare got a count anyway');
  assert.deepEqual(oddRow.undeclared.map(u => u.id), ['m1']);
  assert.equal(oddRow.undeclared[0].state, 'idle');
  assert.equal(odd.isState('idle'), false);
  assert.equal(odd.isState('frozen'), true);
});

test('R19 §4 the drift the unread list was hiding: `unworked` is a state a machine really sets', () => {
  // §3 invented `unworked` (a tended machine standing cold) and nothing checked the enumeration, so
  // the data did not list it. This asserts the code and the file agree from BOTH sides: every word
  // js/refine.js can set is declared, and the grid accepts it.
  const grid = createGrid({ power: POW });
  for (const word of ['running', 'idle', 'starved', 'unworked', 'unpowered', 'shed', 'blocked']) {
    assert.equal(grid.isState(word), true, `js/refine.js sets "${word}" and data/power.json does not declare it`);
  }
  assert.equal(grid.isState('queued'), false, 'queued is a row in a queue, not a machine state');
});

test('R19 §4 a machine checks its own badge against the declared list', () => {
  const build = power => {
    const grid = createGrid({ power });
    const works = createWorks({ refining: REF, resources: RES, grid });
    works.place({ id: 'f1', type: 'furnace', x: 0, z: 0 });
    return works;
  };

  const shipped = build(POW);
  shipped.get('f1').state = 'unworked';
  const good = shipped.snapshot('f1');
  assert.equal(good.declared, true, 'a state data/power.json declares came back as undeclared');
  assert.match(good.stateText, /^Standing cold — nobody is working this/);

  // the same machine, in the same state, against a grid whose data does not admit the word. The
  // sentence is unchanged (the switch has a case for it) but the snapshot now says it is off-list,
  // which is the audit that would have caught `unworked` missing from the file in the first place.
  const thin = build({ ...POW, machineStates: ['running', 'idle'] });
  thin.get('f1').state = 'unworked';
  assert.equal(thin.snapshot('f1').declared, false, 'refine.js is not reading the grid’s declared list');

  // and a word NOTHING has a case for reads as a fault rather than as a raw key at the player
  shipped.get('f1').state = 'frozen';
  const bad = shipped.snapshot('f1');
  assert.equal(bad.declared, false);
  assert.match(bad.stateText, /nothing knows what "frozen" means/,
    'an undeclared state printed a raw key at the player');

  // with no grid to ask there is no list, so nothing is called a fault on a hunch
  const alone = createWorks({ refining: REF, resources: RES });
  alone.place({ id: 'f2', type: 'furnace', x: 0, z: 0 });
  alone.get('f2').state = 'frozen';
  assert.equal(alone.snapshot('f2').declared, true);
  assert.equal(alone.snapshot('f2').stateText, 'frozen');
});

// ================================================================ 5. what a rare element weighs

/**
 * A rare element is deliberately not in `data.materials` — which rare elements exist is the
 * universe's business — so `walkSpeedFor` and `carryFor` looked its weight and stack up by key,
 * missed, and fell back to 1 and 40. `rareSeam.weightPerUnit` (0.8) and `rareSeam.stack` (15) were
 * both read by nobody. The stack is the one that mattered: fifteen a trip against forty is nearly
 * three times the walking.
 */
const rareNode = (x = 300) => ({
  id: 'rs', kind: 'rare_seam', resource: 'aetherite', rare: true,
  x, z: 0, richness: 1, band: bandFor(1, RES),
  amount: 100, initial: 100, infinite: false, radius: 3,
  hardness: RES.rareSeam.hardness, respawnSeconds: 0, handMinable: true,
  depleted: false, gone: false, respawnIn: null, worked: 0,
});

test('R19 §5 rareSeam.stack: a rare seam is carried fifteen at a time, not forty', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'powered_tool' };
  const shipped = haulReport(rareNode(), ctx);
  assert.equal(shipped.carry, RES.rareSeam.stack, 'the rare seam is still using the 40-unit default');

  const roomy = haulReport(rareNode(), { ...ctx, data: tweak(RES, 'rareSeam.stack', 40) });
  assert.equal(roomy.carry, 40);
  // a bigger armful means fewer walks, so more arrives per minute from the same seam
  assert.ok(roomy.deliveredPerMinute > shipped.deliveredPerMinute,
    `stack did not touch the delivery: ${shipped.deliveredPerMinute} vs ${roomy.deliveredPerMinute}`);
  // and the walk is a much larger share of a fifteen-unit trip, which is the whole point
  assert.ok(shipped.walkShare > roomy.walkShare);
});

test('R19 §5 rareSeam.weightPerUnit: how fast you walk under a load of it', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'powered_tool' };
  const light = haulReport(rareNode(), { ...ctx, data: tweak(RES, 'rareSeam.weightPerUnit', 0.2) });
  const heavy = haulReport(rareNode(), { ...ctx, data: tweak(RES, 'rareSeam.weightPerUnit', 4) });
  assert.ok(light.walkSeconds < heavy.walkSeconds,
    `weightPerUnit did not reach the walk: ${light.walkSeconds} vs ${heavy.walkSeconds}`);
  assert.ok(light.deliveredPerMinute > heavy.deliveredPerMinute);

  // the shipped 0.8 sits between the two, and is NOT the 1.0 default the missed lookup gave it
  const shipped = haulReport(rareNode(), ctx);
  const asDefault = haulReport(rareNode(), { ...ctx, data: tweak(RES, 'rareSeam.weightPerUnit', 1) });
  assert.ok(shipped.walkSeconds < asDefault.walkSeconds,
    'weightPerUnit 0.8 walks the same as the 1.0 fallback, so it is not being read');
});

test('R19 §5 an ordinary node still takes its numbers from `materials`, untouched', () => {
  const iron = {
    id: 'n', kind: 'ore_outcrop', resource: 'iron_ore', x: 300, z: 0, richness: 1,
    band: bandFor(1, RES), amount: 1000, initial: 1000, infinite: false, radius: 2,
    hardness: 1, respawnSeconds: 5400, handMinable: true,
    depleted: false, gone: false, respawnIn: null, worked: 0,
  };
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'iron_tool' };
  const before = haulReport(iron, ctx);
  // move the rare-seam numbers as far as they go; iron must not notice
  const after = haulReport(iron, { ...ctx, data: tweak(tweak(RES, 'rareSeam.stack', 1), 'rareSeam.weightPerUnit', 90) });
  assert.equal(after.carry, before.carry);
  assert.equal(after.deliveredPerMinute, before.deliveredPerMinute);
  assert.equal(before.carry, Math.min(RES.haul.carry, RES.materials.iron_ore.stack));
});

test('R19 §5 the break-even distance measures a rare seam with a rare seam’s arms', () => {
  const ctx = { data: RES, origin: { x: 0, z: 0 }, tool: 'powered_tool' };
  const near = {
    id: 'lean', kind: 'ore_outcrop', resource: 'iron_ore', x: 15, z: 0, richness: 0.15,
    band: bandFor(0.15, RES), amount: 1000, initial: 1000, infinite: false, radius: 2,
    hardness: 1, respawnSeconds: 5400, handMinable: true,
    depleted: false, gone: false, respawnIn: null, worked: 0,
  };
  const tiny = breakEvenAgainst(rareNode(50), near, { ...ctx, data: tweak(RES, 'rareSeam.stack', 2) });
  const roomy = breakEvenAgainst(rareNode(50), near, { ...ctx, data: tweak(RES, 'rareSeam.stack', 40) });
  assert.ok(roomy.distance > tiny.distance,
    `the stack did not reach breakEvenAgainst: ${tiny.distance} vs ${roomy.distance}`);
});
